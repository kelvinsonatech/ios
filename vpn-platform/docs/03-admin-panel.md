# 3. Admin panel & Server Management module

The admin panel lives under `/admin` (route group `src/app/admin/(panel)`). Every page checks the session and a permission on the server; every Server Action re-checks them itself (page checks never protect actions).

## Information architecture

| Page | Path | Permission | Contents |
| --- | --- | --- | --- |
| Sign in / 2FA | `/admin/login`, `/admin/login/mfa` | — | Email + password, then TOTP or recovery code when MFA is on |
| Dashboard | `/admin` | `dashboard:view` | Total / online / offline / maintenance servers, active accounts, created today / this month, recent errors, protocol usage, 14-day creation trend, server capacity, recent activity |
| Servers | `/admin/servers` | `servers:view` | Flag, name, location, hostname, status + "SERVER SCRIPT OUTDATED" badge, accounts x/y, enabled protocols, last seen, actions menu |
| Add server | `/admin/servers/new` | `servers:create` | Details + provisioning API credentials → **Connect server** |
| Setup | `/admin/servers/:id/setup` | `servers:edit` | 1 Connection & verification · 2 Detected protocols (toggles, per-protocol caps) · 3 **Publish** |
| Server detail | `/admin/servers/:id` | `servers:view` | Status, hostname, IP, country/city, provider, script & API versions, CPU/RAM/disk/load/uptime, recent checks, accounts current/max, protocols, last connection / sync / health check, notes, recent activity |
| Edit server | `/admin/servers/:id/edit` | `servers:edit` | Details; connection & credential rotation (secret write-only) |
| Server protocols | `/admin/servers/:id/protocols` | `servers:view` (edit to change) | Manual protocol override per server |
| Protocols | `/admin/protocols` | `protocols:view` | Enabled toggle, identifiers, servers published/detected, active accounts, durations |
| Protocol editor | `/admin/protocols/:id`, `/new` | `protocols:edit` | Display name, slug, description, icon, category, adapter, enabled, order, node identifiers, duration options, per-IP limit, **input fields**, **output fields**, live form preview |
| Accounts | `/admin/accounts` | `accounts:view` | Filters: username, server, protocol, status, country, created from/to, expires before. (Revoke/renew/delete UI: phase 13) |
| Logs | `/admin/logs` | `logs:view` (`audit:view` for the audit tab) | Provisioning & server events; administrator audit trail; filters |
| Administrators | `/admin/admins` | `admins:manage` | Create, change role, set password, reset 2FA, deactivate |
| My account | `/admin/account` | signed in | 2FA enrolment (QR + recovery codes), password change, active sessions |

## Server actions and confirmations

| Action | Permission | Confirmation | Effect |
| --- | --- | --- | --- |
| View / Edit / Protocols / Accounts | view/edit | — | Navigation |
| Test connection | `servers:operate` | — | `/info` + `/health`; result dialog with latency, versions, compatibility, warnings; updates health |
| Sync | `servers:operate` | — | Full capability detection; dialog lists new / missing / unmapped protocols |
| Maintenance | `servers:operate` | Dialog | Existing accounts keep working; new creation paused; users see "Server temporarily under maintenance." |
| End maintenance / Enable | `servers:operate` | — | Back to active (blocked if the script is unsupported) |
| Disable | `servers:operate` | Destructive dialog | Removed from public pages |
| Restart provisioning service | `servers:operate` | Dialog | Predefined `POST /agent/restart` (only shown when the server reports the capability) |
| Delete | `servers:delete` | Type the server name | Soft delete, credentials revoked, history kept |
| Publish | `servers:edit` | — | Requires a successful connection, a non-unsupported script and ≥1 enabled detected protocol |

All of them write an audit entry and, where relevant, a provisioning log event.

## Server Management module (backend)

| Module | Responsibility |
| --- | --- |
| `servers/validation.ts` | Zod schemas: details (hostname, IP, port, base path, capacity, driver) and connection (auth method, key id, secret ≥16 chars, TLS mode with conditional CA / fingerprint / mTLS) |
| `servers/service.ts` | `createServerDraft`, `updateServerDetails`, `updateServerConnection` (rotation; blank secret keeps the current one), `publishServer`, `setServerLifecycle` (allowed transitions only), `updateServerProtocols` (only detected protocols can be enabled), `deleteServer` |
| `servers/sync.ts` | `testConnection`, `syncServer` (detection: identifier mapping, auto-enable only for drafts, removal handling, unmapped identifiers, warnings: hostname/IP mismatch, clock skew, missing idempotency), `restartProvisioningService` |
| `servers/status.ts` | Effective status (TS + SQL twin) |
| `servers/queries.ts` | Admin list/detail queries (never select secrets) |
| `nodes/*` | Contract schemas, signing, transport, drivers, compatibility, credential loading |

### Protocol detection rules

* A server's reported identifiers are matched case-insensitively (spaces, `_` and `.` count as `-`) against each protocol's slug and **admin-editable** `node_identifiers`. Built-in aliases: e.g. `ssh-ws` → SSH WebSocket, `stunnel` → SSH SSL, `wg` → WireGuard, `ss` → Shadowsocks.
* Identifiers that match nothing are shown as "unmapped" on the server page — map them in the protocol editor and sync again, or create a new protocol. Nothing is guessed.
* Initial connect (draft): detected protocols are pre-enabled so the admin reviews and unticks.
* Published server: newly detected protocols are "Available" (disabled) until an admin enables them.
* A protocol the server stops reporting is unpublished immediately; its admin switch is remembered.

## Roles

| Permission | Super Admin | Administrator | Server Manager | Support |
| --- | :-: | :-: | :-: | :-: |
| dashboard:view | ✓ | ✓ | ✓ | ✓ |
| servers:view | ✓ | ✓ | ✓ | ✓ |
| servers:create / edit / operate | ✓ | ✓ | ✓ | |
| servers:delete | ✓ | ✓ | | |
| protocols:view | ✓ | ✓ | ✓ | ✓ |
| protocols:edit | ✓ | ✓ | | |
| accounts:view | ✓ | ✓ | ✓ | ✓ |
| accounts:manage (revoke/renew) | ✓ | ✓ | | ✓ |
| logs:view | ✓ | ✓ | ✓ | ✓ |
| audit:view | ✓ | ✓ | | |
| admins:manage | ✓ | | | |

The matrix lives in `src/server/auth/rbac.ts`. At least one active Super Admin is always kept; nobody can change their own role or deactivate themselves.

## UI conventions

* Original "Vaultline" identity (name configurable via `NEXT_PUBLIC_SITE_NAME`): slate surfaces, signal-green primary, keyhole-shield mark. Light, dark and system themes; responsive sidebar → slide-over navigation on mobile.
* Forms keep typed values on validation errors (submitted via `useServerAction`, not React's auto-resetting form actions). Secrets are write-only: inputs never echo stored values.
* Destructive actions use dialogs; deletion requires typing the server name.
