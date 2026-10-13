# 7. Implementation roadmap

Status as of this delivery. ✅ done · ⏸ waiting for your server script · ⬜ not started.

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
| **—** | **STOP: provide the existing server script / API** | ⏸ | See [08-server-script-intake.md](08-server-script-intake.md) |
| 10 | Analyse your script | ⏸ | Inputs, commands, outputs, files, expiry, restarts |
| 11 | Implement the real server adapter | ⏸ | Agent implementing the contract **or** a driver for the script's API; align adapter `config` parsing and protocol identifiers |
| 12 | Test account creation on one controlled server | ⏸ | Add an "admin test provisioning" action; run every protocol once |
| 13 | Account management | ⬜ (list ✅) | Revoke / renew / delete actions, safe config view; service functions exist (`revokeAccount`) |
| 14 | Public protocol pages | ⬜ (home ✅) | `/[protocol]` pages from `listPublicProtocols()` / `getPublicProtocolServers()`; Server Status, Tools, About, Contact, Privacy, Terms, AUP |
| 15 | Public server listings from DB | ⬜ (API ✅) | `/api/public/*` already implements auto-publishing |
| 16 | CREATE ACCOUNT → provisioning | ⬜ (service ✅) | Route handler calling `requestAccount()`, polling `getRequestStatus()`; captcha hook |
| 17 | Config / QR / download output | ⬜ | Render `PresentedAccount` fields, artifacts (copy, QR via `qrcode`, file download) |
| 18 | Health monitoring | ⬜ (checks ✅) | Scheduled `testConnection()` for every server in the worker, failure threshold before OFFLINE, retention |
| 19 | Expiry synchronisation | ⬜ | ACTIVE → EXPIRED by `expires_at`; reconcile with node (`listAccounts`) or send revoke, depending on script behaviour |
| 20 | Security testing | ⬜ | Dependency audit, DAST on admin, node agent review, load test of provisioning |
| 21 | Production deployment | ⬜ (Docker ✅) | Dockerfile + compose + Caddy are ready; secrets, backups, monitoring, firewall rules |

## Verification done for phases 1–9

* `npm run typecheck`, `npm run lint` — clean.
* `npm test` — 116 tests: crypto, signing, TLS modes (custom CA + pinned certificate with a real self-signed cert), SSRF guard, adapters, dynamic input validation, RBAC, MFA; integration against PostgreSQL + Redis + in-process mock node: add → detect → publish → auto-publishing, per-server/global toggles, sync add/remove, maintenance/disable/offline, incompatible/outdated scripts, idempotency (double click), uncertain outcome without duplicates, capacity under concurrency, rate limits, revoke, sweeper, login/lockout/sessions/MFA replay.
* Playwright walk-through of the real admin UI (login → add server → connect → setup → publish → sync new protocol → maintenance → protocol editor → logs → MFA enrolment) in light/dark and mobile: no console errors.
