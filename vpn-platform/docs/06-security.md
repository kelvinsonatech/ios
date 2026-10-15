# 6. Security boundaries

## Trust zones

| Zone | Trust | Holds | Talks to |
| --- | --- | --- | --- |
| Public browser | Untrusted | Nothing secret; a claim token for its own request | Website only |
| Admin browser | Authenticated, role-limited | Session cookie (HttpOnly, Secure, SameSite=Strict, `__Host-`) | Website only |
| Website (web + worker) | Trusted | DB/Redis credentials, encryption keyring | PostgreSQL, Redis, VPN servers |
| VPN server | Semi-trusted | Its own API secret, the accounts it serves | Answers the website |
| PostgreSQL / Redis | Trusted infrastructure | Ciphertexts, hashes, safe metadata | — |

The browser never reaches a VPN server; VPN servers never receive anything but predefined operations.

## Controls

### Server communication
* **Predefined operations only.** `NodeDriver` has no command/exec method; request paths are constants; ids in paths are validated and URL-encoded.
* **Per-server credentials**, encrypted at rest (AES-256-GCM keyring with rotation; ciphertext bound to the server row via AAD). Secrets are write-only in the UI and never sent to the browser.
* **Signed requests** (HMAC-SHA256 over method, path+query, timestamp, nonce, body hash) with replay protection on the node; bearer tokens as a fallback.
* **TLS verification** with public CA, custom CA, pinned fingerprint or mTLS. Plain HTTP refused in production unless explicitly allowed.
* **SSRF guard:** server IPs in loopback/private/link-local (cloud metadata)/CGNAT/reserved ranges are rejected (opt-in for private management networks); DNS is pinned to the admin-entered IP so a hostname cannot be re-pointed.
* **Response hardening:** JSON only, 1 MiB cap, no redirects, strict Zod schemas, string length limits, control characters rejected, URI scheme allow-list, WireGuard/OpenVPN shape checks. Node text is never rendered as HTML.
* **Version gate:** unsupported API majors cannot be published or provisioned.

### Public site and account creation
Details: [09-public-site.md § Security notes](09-public-site.md#security-notes).
* Public listings, the status page and the public API never carry server IPs, management API ports or credentials; the VPN hostname only when the admin enables it (Site settings → Public display).
* Public POST endpoints (`/api/public/accounts`, `/api/public/reports`): same-origin check, JSON only, body size limits, strict zod schemas.
* Strict input validation from the protocol definition **plus** non-relaxable adapter guards (safe character sets, reserved usernames such as `root`).
* Rate limits per client IP (burst + per protocol per day for accounts, per hour and day for reports), failing closed if Redis is down; Cloudflare Turnstile (`CAPTCHA_PROVIDER=turnstile`) verified server side and failing closed.
* Idempotency keys; capacity and creation-quota reservation under row locks; maintenance/offline/full/quota enforced in the backend, not only the UI.
* TTL-limited, encrypted result retrieval with an unguessable claim token; secrets are erased afterwards and never logged.
* Client IPs stored only as keyed hashes. Admin-entered and node-provided text rendered as text; links from settings limited to site paths and `https://` URLs.
* DiceBear avatars generated on the server; the site loads no third-party asset (Turnstile is the only exception, and only when enabled).

### Admin panel
* Argon2id password hashing; password policy (12+ chars, 3 classes).
* Server-side sessions (only SHA-256 of the token stored), 30 min idle / 12 h absolute expiry, invalidated on password change, role change or deactivation.
* Optional TOTP MFA with replay protection and hashed single-use recovery codes; a dashboard banner nudges admins to enable it.
* Brute-force protection: per-IP and per-email rate limits + per-account lockout; generic error messages and constant-ish timing for unknown accounts.
* **CSRF:** SameSite=Strict cookies, POST-only Server Actions with Next.js Origin/Host verification (`SERVER_ACTIONS_ALLOWED_ORIGINS` for proxies).
* **RBAC** checked in every page *and* every Server Action (`authorize()`), never only in the UI.
* **Audit log** for every admin action (with IP and user agent); **provisioning log** for operational events.
* **Headers:** per-request CSP nonce (`script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS (HTTPS), `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, `Cache-Control: no-store` on admin routes; admin pages are `noindex`.

### Logging hygiene
`redact()` removes passwords, secrets, tokens, keys, UUIDs, configs, links and similar keys at any depth before anything reaches logs, audit details or `provisioning_logs`. Tests assert that no password or link appears in logs after provisioning.

## Threats considered

| Threat | Mitigation |
| --- | --- |
| Attacker uses account creation to run commands on a VPN server | No command endpoint; strict character allow-lists; node must use argument arrays; reserved usernames |
| Stolen database dump | Secrets encrypted with a key outside the DB; no account secrets stored; passwords Argon2id; session tokens hashed |
| Compromised/malicious VPN server | Response validation, size limits, no HTML rendering, scheme allow-list; one server's secret cannot access another |
| SSRF via server address | Private-range blocking, pinned DNS, admin-only input |
| Replay of a signed request | Timestamp window + nonce cache on the node |
| Double click / retries creating duplicate accounts | Idempotency key, request-id idempotency on the node, lookup before retry |
| Admin credential stuffing | Rate limits, lockout, MFA, audit |
| CSRF / clickjacking / XSS | SameSite=Strict, Origin checks, frame-ancestors none, CSP nonces, React escaping |
| Spoofed client IP | Client IP taken from X-Forwarded-For at a configured hop count behind Caddy; the app port is never exposed directly |

## Operational requirements
* Generate `APP_ENCRYPTION_KEYS` and `IP_HASH_SECRET` per environment; store them in a secrets manager; rotate by adding a key and switching `APP_ENCRYPTION_ACTIVE_KEY`.
* Run behind Caddy/nginx with HTTPS; keep `TRUSTED_PROXY_HOPS` accurate.
* Firewall node API ports to the website's IP; enable NTP on nodes.
* Back up PostgreSQL (encrypted); Redis contains no source-of-truth data.
* Phase 20 (security testing) covers dependency audit, authenticated DAST against the admin panel and a review of the node agent.
