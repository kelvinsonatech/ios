# 3. Admin panel & Server Management module

The admin panel lives under `/admin` (route group `src/app/admin/(panel)`). Every page checks the session and a permission on the server; every Server Action re-checks them itself (page checks never protect actions).

## Information architecture

| Page | Path | Permission | Contents |
| --- | --- | --- | --- |
| Sign in / 2FA | `/admin/login`, `/admin/login/mfa` | — | Email + password, then TOTP or recovery code when MFA is on |
| Dashboard | `/admin` | `dashboard:view` | Total / online / offline / maintenance servers, active accounts, created today / this month, open reports, recent errors, protocol usage, 14-day creation trend, server capacity, recent activity |
| Servers | `/admin/servers` | `servers:view` | Flag, name + URL name (`de1`), location, hostname, status + "SERVER SCRIPT OUTDATED" badge, accounts x/y, enabled protocols, last seen, actions menu |
| Add server | `/admin/servers/new` | `servers:create` | Details (incl. optional URL name) + provisioning API credentials → **Connect server** |
| Setup | `/admin/servers/:id/setup` | `servers:edit` | 1 Connection & verification · 2 Detected protocols (toggles, per-protocol caps, creation quotas) · 3 **Publish** |
| Server detail | `/admin/servers/:id` | `servers:view` | Status, hostname, IP, URL name, country/city, provider, script & API versions, CPU/RAM/disk/load/uptime, health sparkline and latency, recent checks, accounts current/max, protocols with quota usage this period, links to the public pages, last connection / sync / health check, notes, recent activity |
| Edit server | `/admin/servers/:id/edit` | `servers:edit` | Details incl. URL name; connection & credential rotation (secret write-only) |
| Server protocols | `/admin/servers/:id/protocols` | `servers:view` (edit to change) | Per-protocol switch, account cap and creation quota (used / limit this period, next reset) |
| Protocols | `/admin/protocols` | `protocols:view` | Enabled toggle, identifiers, servers published/detected, active accounts, durations |
| Protocol editor | `/admin/protocols/:id`, `/new` | `protocols:edit` | Display name, slug (not a reserved public path such as `report` or `server-status`), description, icon, category, adapter, enabled, order, node identifiers, duration options, per-IP limit, **input fields**, **output fields**, live form preview |
| Accounts | `/admin/accounts` | `accounts:view` (`accounts:manage` to revoke) | DiceBear avatar per account, status counts, filters (username, server, protocol, status, country, created from/to, expires before), non-secret details dialog, **Revoke** with confirmation. Renew/delete are not exposed |
| Reports | `/admin/reports` | `reports:view` (`reports:manage` to change) | "Report a problem" submissions: Open / Resolved / All tabs with counts, category, server, protocol, message, reply email; resolve with a note or reopen. The open count is a badge in the navigation |
| Logs | `/admin/logs` | `logs:view` (`audit:view` for the audit tab) | Provisioning & server events; administrator audit trail; filters |
| Administrators | `/admin/admins` | `admins:manage` | Avatars; create, change role, set password, reset 2FA, deactivate |
| My account | `/admin/account` | signed in | Avatar, 2FA enrolment (QR + recovery codes), password change, active sessions |
| Site settings | `/admin/settings` | `settings:manage` | Brand texts, announcement bar, public display, quota reset times and default quota, health monitor, avatar style, contact, account rules (see [Public site](09-public-site.md#admin-settings-and-reports)) |

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
| `servers/service.ts` | `createServerDraft` (generates the URL name with `nextServerSlug`), `updateServerDetails`, `updateServerConnection` (rotation; blank secret keeps the current one), `publishServer`, `setServerLifecycle` (allowed transitions only), `updateServerProtocols` (only detected protocols can be enabled; caps and `quotaLimit`), `deleteServer` |
| `servers/sync.ts` | `testConnection`, `syncServer` (detection: identifier mapping, auto-enable only for drafts, removal handling, unmapped identifiers, warnings: hostname/IP mismatch, clock skew, missing idempotency), `restartProvisioningService` |
| `servers/status.ts` | Effective status (TS + SQL twin) |
| `servers/health.ts` | Health monitor run by the worker (see [Public site](09-public-site.md#health-monitor)) |
| `servers/queries.ts` | Admin list/detail queries (never select secrets) |
| `nodes/*` | Contract schemas, signing, transport, drivers, compatibility, credential loading |
| `settings/service.ts` | `getSiteSettings()` (5 s cache per process), `updateSiteSettings()` (validated, audited) |
| `reports/service.ts` | `createReport()` (public, rate-limited), `listReports()`, `setReportStatus()` (audited), `countOpenReports()` |

### Server URL names

Every server has a URL name used in its public address, `/<protocol>/<country>/<url name>` (for example `/vless/germany/de1`). Left empty on **Add server**, it becomes the next free `<country code><n>` (`de1`, `de2` …). It is unique among non-deleted servers, uses lowercase letters, digits and `-` (up to 32 characters), and can be changed under **Edit server**; old links then stop working.

### Account caps and creation quotas

Per server and protocol (setup step 2 and the server's **Protocols** page):

* **Account cap** — live accounts of that protocol on the server (empty = only the server's overall cap applies).
* **Creation quota** — new accounts per reset period (empty = no quota). All quotas reset at the times set in **Site settings → Quotas & resets** (default 00:00 and 12:00); the table shows how many were created this period and when the next reset happens. New protocol rows start with the default quota from the same settings.

The public "N slots left" is the smallest of what is left under the server cap, the protocol cap and the quota. Details: [Public site → Quota model](09-public-site.md#quota-model).

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
| accounts:manage (revoke) | ✓ | ✓ | | ✓ |
| logs:view | ✓ | ✓ | ✓ | ✓ |
| audit:view | ✓ | ✓ | | |
| admins:manage | ✓ | | | |
| settings:manage | ✓ | ✓ | | |
| reports:view / reports:manage | ✓ | ✓ | ✓ | ✓ |

The matrix lives in `src/server/auth/rbac.ts`. At least one active Super Admin is always kept; nobody can change their own role or deactivate themselves.

## UI conventions

* Original "Vaultline" identity: slate surfaces, signal-green primary, keyhole-shield mark. The public site and page titles use the site name from **Site settings**; the admin header uses the build-time default `NEXT_PUBLIC_SITE_NAME`. Light, dark and system themes; responsive sidebar → slide-over navigation on mobile.
* Every administrator and every VPN account has a DiceBear avatar generated on the server (style chosen in **Site settings → Avatars**).
* Forms keep typed values on validation errors (submitted via `useServerAction`, not React's auto-resetting form actions). Secrets are write-only: inputs never echo stored values.
* Destructive actions use dialogs; deletion requires typing the server name.
