# 7. Implementation roadmap

Status as of this delivery. ✅ done · 🟡 partly done · ⬜ not started.

| Phase | Scope | Status | Where |
| --- | --- | --- | --- |
| 1 | Database architecture | ✅ | `src/server/db/schema.ts`, `drizzle/`, seed of 12 protocols |
| 2 | Admin authentication | ✅ | Argon2id, DB sessions, lockout + rate limits, TOTP MFA + recovery codes, RBAC (4 roles), CSRF/CSP, audit log, admin management, self-service account page |
| 3 | Admin dashboard | ✅ | Fleet stats, protocol usage, capacity, errors, activity, 14-day trend |
| 4 | Server management | ✅ | List/detail/edit, lifecycle (maintenance/disable/enable), credential rotation, soft delete, actions menu with confirmations |
| 5 | Add Server workflow | ✅ | Draft → connect → setup (verify, review protocols) → publish |
| 6 | Server connection test | ✅ | Signed HTTPS client, TLS modes, SSRF guard, error classification, version compatibility ("SERVER SCRIPT OUTDATED") |
| 7 | Capability detection | ✅ | Identifier mapping, auto-enable on drafts, "Available" on published servers, removal handling, unmapped identifiers, warnings |
| 8 | Protocol management | ✅ | Global toggles, editor for display/slug/icon/identifiers/durations/limits, dynamic input fields, output fields, live preview, new protocols (generic adapter) |
| 9 | Provisioning interface / adapters | ✅ | NodeDriver interface + `contract-v1` driver, 13 protocol adapters, ProvisioningService lifecycle (idempotency, capacity, uncertain-outcome reconciliation), BullMQ worker + sweeper, mock node |
| 10 | Analyse your script | ✅ | The owner's node API (built from [10-script-api-prompt.md](10-script-api-prompt.md)) implements the contract; protocol ids `ssh`, `ssh-ssl`, `slowdns`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `zivpn`; `capabilities.expiry_managed_by_node=false` |
| 11 | Implement the real server adapter | ✅ | `contract-v1` driver talks to the owner's node API directly; adapters parse the config keys of section 8 of the prompt |
| 12 | Test account creation on one controlled server | 🟡 | SSH, SSH SSL and SlowDNS pass all checks on the owner's server (`npm run node:check` + on-VPS self-test); the other protocols still need a run against a real node |
| 13 | Account management | ✅ | Admin accounts list with DiceBear avatars, filters, detail dialog and revoke (`revokeAccount`); renew/delete are not exposed |
| 14 | Public protocol pages | ✅ | `/`, `/<protocol>`, `/<protocol>/<country>`, `/<protocol>/<country>/<server>` from `src/server/public/catalog.ts` (`listProtocolSummaries`, `getProtocolPage`, `getCountryPage`, `getServerPage`, `getStatusPage`); `/server-status`, `/report`, `/my-accounts`, About, Contact, Privacy, Terms, AUP, sitemap/robots |
| 15 | Public server listings from DB | ✅ | Auto-publishing query; "N slots left" from per-protocol creation quotas (reset at fixed local times) and active-account caps |
| 16 | CREATE ACCOUNT → provisioning | ✅ | `POST /api/public/accounts` (same-origin, JSON, zod, rate limits, optional Turnstile failing closed) → `requestAccount()` → worker; polling `GET /api/public/accounts/<id>` with the claim token |
| 17 | Config / QR / download output | ✅ | One-time result with DiceBear avatar, copy buttons, QR codes, file downloads, `.txt` export |
| 18 | Health monitoring | ✅ | Worker health tick (30 s) per server: online/offline with a failure threshold, latency, 7-day history, admin sparkline |
| 19 | Expiry synchronisation | ✅ | Worker expiry job: ACTIVE → EXPIRED by `expires_at`, then a revoke is sent to the node (nodes report `expiry_managed_by_node=false`) |
| 20 | Security testing | ⬜ | Dependency audit, DAST on admin, node agent review, load test of provisioning |
| 21 | Production deployment | ⬜ (Docker ✅) | Dockerfile + compose + Caddy are ready; secrets, backups, monitoring, firewall rules |

## Verification done for phases 1–9

* `npm run typecheck`, `npm run lint` — clean.
* `npm test` — 116 tests: crypto, signing, TLS modes (custom CA + pinned certificate with a real self-signed cert), SSRF guard, adapters, dynamic input validation, RBAC, MFA; integration against PostgreSQL + Redis + in-process mock node: add → detect → publish → auto-publishing, per-server/global toggles, sync add/remove, maintenance/disable/offline, incompatible/outdated scripts, idempotency (double click), uncertain outcome without duplicates, capacity under concurrency, rate limits, revoke, sweeper, login/lockout/sessions/MFA replay.
* Playwright walk-through of the real admin UI (login → add server → connect → setup → publish → sync new protocol → maintenance → protocol editor → logs → MFA enrolment) in light/dark and mobile: no console errors.
