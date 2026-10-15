# 7. Implementation roadmap

Status as of this delivery. ✅ done · 🟡 partly done · ⬜ not started.

**Summary:** 17 of the 21 phases are done, 2 are partly done (12 real-node tests, 13 account management) and 2 are open (20 security testing, 21 production deployment, for which the Docker setup already exists).

| Phase | Scope | Status | Where |
| --- | --- | --- | --- |
| 1 | Database architecture | ✅ | `src/server/db/schema.ts`, `drizzle/`, seed of the built-in protocols |
| 2 | Admin authentication | ✅ | Argon2id, DB sessions, lockout + rate limits, TOTP MFA + recovery codes, RBAC (4 roles), CSRF/CSP, audit log, admin management, self-service account page |
| 3 | Admin dashboard | ✅ | Fleet stats, protocol usage, capacity, errors, activity, 14-day trend, open reports |
| 4 | Server management | ✅ | List/detail/edit, lifecycle (maintenance/disable/enable), credential rotation, soft delete, actions menu with confirmations, URL names (`de1`) |
| 5 | Add Server workflow | ✅ | Draft → connect → setup (verify, review protocols, caps and quotas) → publish |
| 6 | Server connection test | ✅ | Signed HTTPS client, TLS modes, SSRF guard, error classification, version compatibility ("SERVER SCRIPT OUTDATED") |
| 7 | Capability detection | ✅ | Identifier mapping, auto-enable on drafts, "Available" on published servers, removal handling, unmapped identifiers, warnings |
| 8 | Protocol management | ✅ | Global toggles, editor for display/slug/icon/identifiers/durations/limits, dynamic input fields, output fields, live preview, new protocols (generic adapter), reserved slugs |
| 9 | Provisioning interface / adapters | ✅ | NodeDriver interface + `contract-v1` driver, protocol adapters, ProvisioningService lifecycle (idempotency, capacity, uncertain-outcome reconciliation), BullMQ worker + sweeper, mock node |
| 10 | Analyse your script | ✅ | The owner's node API (built from [10-script-api-prompt.md](10-script-api-prompt.md)) implements the contract; protocol ids `ssh`, `ssh-ssl`, `slowdns`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `zivpn`; it reports `capabilities.expiry_managed_by_node=false` |
| 11 | Implement the real server adapter | ✅ | `contract-v1` driver talks to the owner's node API directly; the adapters in `src/server/provisioning/adapters/` parse the config keys of section 8 of the prompt (`tests/unit/owner-adapters.test.ts`) |
| 12 | Test account creation on one controlled server | 🟡 | SSH, SSH SSL and SlowDNS pass every check of `scripts/node-selftest.py` on the owner's server, and `npm run node:check` (`scripts/node-check.ts`) checks a node from the website side. VMess, VLESS, Trojan, Hysteria 1, Hysteria 2 and ZIVPN are **untested on the owner's node** because those services were stopped during the test; the transport option the website sends for VMess/VLESS/Trojan is not exercised by either checker |
| 13 | Account management | 🟡 | Admin → Accounts: DiceBear avatars, filters, status counts, non-secret detail dialog, **revoke** with confirmation (`src/app/admin/(panel)/accounts/`, `src/server/accounts/queries.ts`, `revokeAccount()` in `src/server/provisioning/service.ts`). Renew and delete are not exposed (the driver supports renew; the public flow does not need it) |
| 14 | Public protocol pages | ✅ | `/`, `/<protocol>`, `/<protocol>/<country>`, `/<protocol>/<country>/<server>`, `/server-status`, `/report`, `/my-accounts`, About, Contact, Privacy, Terms, AUP, sitemap/robots (`src/app/(public)/`, `src/components/public/`); data from `src/server/public/catalog.ts`. See [Public site](09-public-site.md) |
| 15 | Public server listings from DB | ✅ | Auto-publishing snapshot query in `catalog.ts`; "N slots left" from per-protocol creation quotas that reset at fixed local times plus active-account caps (`src/server/provisioning/quota.ts`, `capacity.ts`) |
| 16 | CREATE ACCOUNT → provisioning | ✅ | `POST /api/public/accounts` (same-origin, JSON, size limit, zod, rate limits, Turnstile failing closed: `src/app/api/public/accounts/route.ts`, `src/server/public/http.ts`, `src/server/captcha.ts`) → `requestAccount()` → worker; polling `GET /api/public/accounts/<id>` with the claim token (`src/components/public/account/use-account-creation.ts`) |
| 17 | Config / QR / download output | ✅ | One-time result with DiceBear avatar, copy buttons, QR codes generated in the browser, file downloads, "Copy all" and `.txt` export (`src/components/public/account/account-result.tsx`, `account-sections.ts`, `qr-dialog.tsx`, `browser-actions.ts`) |
| 18 | Health monitoring | ✅ | Worker health tick (30 s) checks each published server at the configured interval: online immediately on success, offline after N failures in a row, latency, 7-day history, admin sparkline (`src/server/servers/health.ts`, `src/worker/index.ts`, `src/components/admin/health-sparkline.tsx`) |
| 19 | Expiry synchronisation | ✅ | Worker expiry job every minute: ACTIVE → EXPIRED by `expires_at`, capacity released, then `DELETE /accounts/<id>` sent to nodes that do not expire accounts themselves, with retries (`src/server/provisioning/expiry.ts`) |
| 20 | Security testing | ⬜ | Dependency audit, DAST on admin and the public API, node agent review, load test of provisioning |
| 21 | Production deployment | ⬜ (Docker ✅) | Dockerfile + compose + Caddy are ready; secrets, backups, monitoring, firewall rules, Turnstile keys |

### Added with the public site (beyond the original phases)

| Feature | Where |
| --- | --- |
| Admin → Site settings: brand texts, announcement, display options, quota reset times, health monitor, avatar style, contact, rules | `src/lib/site-settings.ts`, `src/server/settings/service.ts`, `src/app/admin/(panel)/settings/` |
| "Report a problem" form and Admin → Reports inbox | `src/server/reports/service.ts`, `src/app/api/public/reports/route.ts`, `src/app/admin/(panel)/reports/` |
| DiceBear avatars for every VPN account and administrator, generated locally | `src/server/avatar.ts`, `src/lib/avatar-styles.ts` |
| Readable server URL names (`de1`), generated per country | `nextServerSlug()` in `src/server/servers/service.ts`, `src/lib/slug.ts` |
| Demo fleet for QA (development only) | `scripts/demo-nodes.ts`, `scripts/demo-seed.ts` (see the README) |

### What is left

1. Run the account checks for VMess, VLESS, Trojan, Hysteria 1, Hysteria 2 and ZIVPN on the owner's node once those services run (section 12 of [10-script-api-prompt.md](10-script-api-prompt.md)), then create one account per protocol and transport from the website.
2. Security testing (phase 20) and the production deployment (phase 21): real secrets, Turnstile keys, backups, monitoring, firewalling each node's API port to the website's IP, and a review of the legal page templates.
3. Optional: renew/delete in Admin → Accounts.

## Verification done for phases 1–9

* `npm run typecheck`, `npm run lint` — clean.
* `npm test` — crypto, signing, TLS modes (custom CA + pinned certificate with a real self-signed cert), SSRF guard, adapters, dynamic input validation, RBAC, MFA; integration against PostgreSQL + Redis + in-process mock node: add → detect → publish → auto-publishing, per-server/global toggles, sync add/remove, maintenance/disable/offline, incompatible/outdated scripts, idempotency (double click), uncertain outcome without duplicates, capacity under concurrency, rate limits, revoke, sweeper, login/lockout/sessions/MFA replay.
* Playwright walk-through of the real admin UI (login → add server → connect → setup → publish → sync new protocol → maintenance → protocol editor → logs → MFA enrolment) in light/dark and mobile: no console errors.

## Tests for phases 10–19

| Area | Tests |
| --- | --- |
| Owner's protocol ids and config keys | `tests/unit/owner-adapters.test.ts`, `tests/unit/adapters.test.ts` |
| Public catalogue, listing rules, hostnames setting, cache | `tests/integration/catalog.test.ts`, `tests/unit/public-cache.test.ts` |
| Public API (origin, content type, size, captcha, errors, polling) | `tests/integration/public-api.test.ts`, `tests/unit/captcha.test.ts` |
| Quota windows (DST), reservation, lazy reset, refunds | `tests/unit/quota.test.ts`, `tests/unit/reset-schedule.test.ts`, `tests/integration/quota.test.ts` |
| Health monitor and expiry | `tests/integration/monitoring.test.ts` |
| Reports | `tests/integration/reports.test.ts` |
| Slugs and avatars | `tests/unit/slug-avatar.test.ts` |
| Public UI helpers (links from settings, ports, form validation, result presentation) | `tests/unit/public-browse.test.ts`, `tests/unit/public-create.test.ts` |
| CSP and admin gate | `tests/unit/proxy-csp.test.ts` |
| Real node | `scripts/node-selftest.py` (on the VPS), `npm run node:check` (website side) |
