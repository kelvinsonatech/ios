# 9. Public site, quotas, monitoring and avatars

The public website is where visitors pick a protocol, a country and a server and create a free account on it. It follows the same page flow as typical free SSH/VPN account sites (protocol → country → server → form → one-time result, plus a live server status page) with the site's own brand, wording and artwork. The brand name and texts come from **Admin → Site settings** (default "Vaultline").

Code: pages in `src/app/(public)`, components in `src/components/public`, data in `src/server/public/catalog.ts`, JSON API in `src/app/api/public`, the data contract between them in `src/lib/public/types.ts`.

## Routes

| Path | Shows | Data |
| --- | --- | --- |
| `/` | Hero with live counters (servers online, countries, accounts today), one card per protocol (category, server count, country flags, availability), "how it works", sample DiceBear profiles, a live status strip, FAQ (reset times and validity filled in from the settings) | `listProtocolSummaries()`, `getSiteStats()`, `getStatusPage()` |
| `/<protocol>` | Countries for that protocol as tiles: flag, servers, availability, remaining slots, best ping; "What is …" and a connection guide (`src/lib/protocol-guides.ts`) | `getProtocolPage()` |
| `/<protocol>/<country>` | One card per server: host (if enabled), location, service ports, transports, validity, status and ping ("checked … ago"), "N slots left" with the reset countdown, **Create account** (disabled with the reason when unavailable), other protocols on the same server | `getCountryPage()` |
| `/<protocol>/<country>/<server>` | Account form (fields defined per protocol in Admin → Protocols) → progress → one-time result, in place. Side card: live status, ping, last check, slots and reset countdown, ports, validity options, the site's rules, other protocols, "Report a problem". When the server cannot take accounts, the form is replaced by the reason and other available servers in the same country | `getServerPage()` |
| `/server-status` | Every published server per protocol (offline ones included): status, ping, last check, remaining slots, Create / Full action; filters (protocol, country, availability, text); auto-refresh every 30 s (paused while the tab is hidden), "Refresh now"; `?protocol=<slug>` preselects a protocol | `getStatusPage()`, then `GET /api/public/status` |
| `/report` | "Report a problem" form; `?server=<id>&protocol=<slug>` preselects the server (linked from server pages) | `getStatusPage()` for the server list, `POST /api/public/reports` |
| `/my-accounts` | Accounts created **in this browser** (non-secret summaries from `localStorage`): avatar, protocol, server, username, live expiry countdown; remove with undo | Browser only |
| `/about`, `/contact`, `/privacy`, `/terms`, `/acceptable-use` | Static pages; contact options from the settings. The legal pages are template text marked **owner review required** (`src/app/(public)/_lib/legal.ts`) | Settings |
| `/sitemap.xml`, `/robots.txt` | Every published protocol, country and server page; `/admin` and `/api/` are disallowed | `listSitemapEntries()` |

Every page shares the same frame (`src/app/(public)/layout.tsx`): a top bar with the reset schedule, a live countdown and the admin's announcement; a sticky header with the Services menu, status link, My accounts and theme switch; a footer with contact, protocol links, legal links and (if enabled) account counters.

* URL segments: protocol slug (Admin → Protocols), country slug from the ISO code (`GB` → `united-kingdom`, `src/lib/slug.ts`), server slug (`de1`, see [Admin panel](03-admin-panel.md)).
* Unknown or malformed slugs return a real **404**: the `[protocol]`, `[country]` and `[server]` layouts validate the slug before anything streams. A protocol slug may not shadow a static route (`RESERVED_PROTOCOL_SLUGS` in `src/server/protocols/validation.ts`).
* Pages render per request (`await connection()`), so new servers and status changes appear without a deploy. A database outage still renders the frame: shared data degrades to empty states, and a protocol, country or server page shows a retry message instead of a false 404 (`src/app/(public)/_lib/data.ts`, `error.tsx`).

## Data flow

```mermaid
flowchart LR
  subgraph Browser
    P[Public pages]
    F[Account form]
  end
  subgraph Web["Web (Next.js)"]
    CAT[catalog.ts<br/>snapshot query, 5–10 s cache]
    API["/api/public/accounts"]
    PS[requestAccount<br/>validate, rate limit, reserve slot + quota]
  end
  subgraph Worker
    W[executeCreate]
    H[health tick 30 s]
    E[expiry 1 min]
  end
  DB[(PostgreSQL)]
  Q[(Redis queue)]
  N[VPN node API]

  P -->|server components| CAT --> DB
  F -->|POST JSON + captcha| API --> PS --> DB
  PS -->|enqueue| Q --> W -->|"signed POST /accounts"| N
  W -->|encrypted one-time result| DB
  F -->|poll with claim token| API
  H -->|"GET /info, /health"| N
  H --> DB
  E -->|"DELETE /accounts/{id}"| N
  E --> DB
```

### Catalogue → pages

`src/server/public/catalog.ts` runs **one query** for every listed (server, protocol) pair and derives every page from that snapshot. A server is listed for a protocol when the protocol is enabled, the server/protocol row is enabled **and** detected, and the server is published (lifecycle `active` or `maintenance`, not deleted, compatibility not `unsupported`). Browse pages show servers whose status is online, full or maintenance; the status page also shows offline ones, and a server page stays reachable while its server is offline (it explains why). Results are cached per process (snapshot and status 5 s, pages 10 s).

The query never selects the server's IP address, management API port or credentials. The VPN hostname is included only when **Show server hostnames** is on (Admin → Site settings → Public display; default on, because users receive it with their account anyway).

**Availability** of a server for one protocol, in priority order: `maintenance` → `offline` (also an unsupported script) → `service_stopped` (the node reports the protocol's service as stopped) → `full` (server status full, or 0 slots left) → `available`.

**Latency** is the round-trip time of the last health check from the website to the server's management API (not from the visitor). It is shown green below 150 ms, amber below 400 ms, red otherwise.

### Public JSON API

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /api/public/protocols` | Protocol summaries | cached 30 s |
| `GET /api/public/protocols/<slug>` | Form definition + countries | cached 30 s, 404 for unknown slugs |
| `GET /api/public/status` | `StatusPageData` for the status page | cached 5 s |
| `GET /api/public/servers` | Same data, for other consumers | cached 30 s |
| `POST /api/public/accounts` | Create an account → `202 {requestId, claimToken, state}` | same-origin JSON ≤ 16 KB, strict zod schema, captcha, rate limits |
| `GET /api/public/accounts/<requestId>` | Poll with header `x-claim-token` → `pending` / `failed` / `active` | `no-store`, 120 polls/min per IP; unknown ids and wrong tokens get the same 404 |
| `POST /api/public/reports` | Report a problem → `201 {id}` | same-origin JSON ≤ 8 KB, captcha, 3/hour and 10/day per IP |

Errors always have the shape `{"error": {"code", "message", "fieldErrors"?, "retryAfterSeconds"?, "resetsAt"?}}` (`PublicApiError`).

### Account creation → one-time result

1. The form (`create-account-panel.tsx`) checks the fields in the browser for instant feedback (`form-validation.ts`, mirroring the server rules) and sends `CreateAccountRequest` with a random idempotency key and, when enabled, the Turnstile token.
2. `POST /api/public/accounts` (`src/app/api/public/accounts/route.ts`): origin, content type and size check (`src/server/public/http.ts`), zod schema, captcha, then `requestAccount()`.
3. `requestAccount()` (`src/server/provisioning/service.ts`) validates the input against the protocol's form definition plus the adapter's hard guards, applies the per-IP rate limits, and in **one transaction with row locks** checks the server (not maintenance/offline), the protocol on that server (enabled, detected, service not stopped), reserves capacity and quota (below), creates the pending account and the provisioning request (input encrypted), then enqueues the job. A double click returns the same request.
4. The worker sends the predefined `POST /accounts` to the node with the request id as idempotency key (details: [Provisioning](05-provisioning.md)), parses the node's `config` with the protocol adapter and stores the presented account **encrypted** (AES-256-GCM, bound to the request id) with an expiry. Only non-secret metadata is kept on the account row.
5. The browser polls `GET /api/public/accounts/<requestId>` with the claim token (every 1–3 s, gives up after 2 minutes and offers "Check again"). The response adds the account's DiceBear avatar. The result view shows every field with copy buttons, QR codes (generated in the browser), file downloads, "Copy all" and a `.txt` export.

The result is available to whoever holds the claim token until `PROVISION_RESULT_TTL_SECONDS` (default 1 hour) passes; then the sweeper erases it and the page says it has expired. The claim token is derived from the idempotency key with `IP_HASH_SECRET`; only its SHA-256 is stored. In the browser the request id and claim token live in `sessionStorage` (this tab only, so a reload recovers the result), the result itself only in memory, and `/my-accounts` keeps non-secret summaries in `localStorage` (never passwords, UUIDs, keys, links or configs).

## Quota model

Three limits apply to every new account (`src/server/provisioning/capacity.ts`):

| Limit | Column | Counts | Freed when |
| --- | --- | --- | --- |
| Server cap | `servers.max_accounts` | live accounts (pending + active) | an account fails, is revoked or expires |
| Protocol cap (optional) | `server_protocols.max_accounts` | live accounts of that protocol | same |
| **Creation quota** (optional) | `server_protocols.quota_limit` | accounts **created** in the current reset window | only a definite provisioning failure gives the quota slot back |

* **Reset windows.** All quotas reset at the same local wall-clock times: Admin → Site settings → Quotas & resets, default `00:00` and `12:00` in the chosen IANA time zone (default `UTC`). A window runs from the latest reset to the next one; DST gaps and overlaps are handled (`src/server/provisioning/quota.ts`, tested across the Europe/Berlin DST switches).
* **Lazy reset.** Nothing runs at reset time. `server_protocols.quota_window_start` records the window `quota_used` belongs to; a row from an older window counts as 0 used. Reservation is one conditional `UPDATE` under row locks, so concurrent requests cannot exceed the quota. Usage is counted even without a limit, so a quota set mid-window is accurate.
* **Refunds.** Each account remembers the window it was counted in (`vpn_accounts.quota_window_start`). A definite failure gives the quota slot back if that window is still current; an uncertain outcome keeps both slots while it is being resolved, and for good (left for an admin to review) if it stays unknown. Revoked and expired accounts free their capacity slot but never the quota slot (the quota counts creations).
* **"N slots left"** = min(server cap left, protocol cap left, quota left) (`capacityOf()` in `catalog.ts`). The bar counts down from the quota when one is set, otherwise from the tighter cap. When a quota applies, the next reset time is shown as a countdown. The country tile sums the slots of its available servers.
* **Quota reached.** The API answers `409 QUOTA_REACHED` with `resetsAt` and a message naming the local reset time; caps answer `409 CAPACITY_REACHED`.
* **Defaults.** `quota.defaultLimit` (Admin → Site settings) is applied to server/protocol rows created by a later connect or sync; existing rows keep their own value. Per server, the quota is edited next to the caps in the setup wizard and on the server's Protocols page.

Separately from slots, each visitor (client IP hash) may send at most 5 account requests per minute and, per protocol, `max_accounts_per_ip_per_day` per day (default 3, Admin → Protocols). Both fail closed if Redis is down.

## Background jobs

The worker (`src/worker/index.ts`, `npm run worker`) runs two BullMQ queues so slow servers never block account creation:

| Job | Schedule | Code |
| --- | --- | --- |
| Account creation, reconciliation of uncertain outcomes | on demand | `provisioning/service.ts` |
| Sweeper: re-enqueue lost jobs, reconcile interrupted requests, erase expired one-time results, purge admin sessions | every minute | `sweep()` |
| Health monitor | tick every 30 s | `src/server/servers/health.ts` |
| Account expiry and node-side removal | every minute | `src/server/provisioning/expiry.ts` |
| Health history retention (7 days) | hourly | `purgeHealthHistory()` |

### Health monitor

Every published server (lifecycle `active`/`maintenance`, not deleted) is checked when its last check is older than **Settings → Health monitor → Check interval** (default 60 s, 30–3600 s). Due servers are claimed atomically, so overlapping ticks or several workers never check a server twice; up to 8 checks run in parallel. A check uses only the predefined `GET /info` and `GET /health` operations:

* success → the server is online (or degraded) immediately, the failure counter resets, and the latency, service states, versions and compatibility are stored;
* failure → `consecutive_failures + 1`; the server turns **offline** only after **Failures before offline** checks in a row (default 3), so one lost packet is not an outage. Offline clears the latency.

Each check adds a `server_health` row (kept 7 days; Admin → server detail shows a sparkline). Provisioning events are written only on transitions (online ↔ offline).

### Account expiry

Every minute, active accounts whose `expires_at` has passed become `expired` (batches of 100, `FOR UPDATE SKIP LOCKED`, safe with several workers) and release their capacity slot. When the server does not remove expired accounts itself (`capabilities.expiry_managed_by_node` is not true; the owner's nodes report `false`), a `revoke` request is recorded in the same transaction and the job sends the predefined `DELETE /accounts/<id>` with that request's id as idempotency key. A 404 counts as already removed; other failures retry with backoff (1, 2, 4 … 60 minutes, up to 12 attempts); a failure is logged in Admin → Logs.

## DiceBear avatars

Every VPN account and every administrator gets an avatar automatically. Avatars are generated **on the website server** with `@dicebear/core` and `@dicebear/collection` 9.4.3 (MIT) as SVG data URIs (`src/server/avatar.ts`): no request to DiceBear or any other third party, nothing about the user leaves the server, and the CSP stays `img-src 'self' data: blob:`.

| Seed | Used for |
| --- | --- |
| `account:<account id>` | The account's avatar: one-time result, My accounts, Admin → Accounts |
| `admin:<admin id>` | Admin header menu, Administrators page, My account |
| `sample:<name>`, `about:<name>`, `vaultline-hero-traveller` | Decorative profiles on the home and About pages |

The same seed always gives the same picture. Avatars are derived, not stored, so changing the style (Admin → Site settings → Avatars) changes them everywhere at once, except the summaries already saved in a visitor's My accounts list, which keep the picture they were saved with. Admin → Accounts loads them from `/admin/accounts/avatar/<id>` (SVG with its own locked-down CSP, `accounts:view` required) instead of inlining every data URI into the page.

Offered styles (`src/lib/avatar-styles.ts`) are limited to artwork that allows commercial use without attribution, so the site needs no credit line:

| Licence | Styles |
| --- | --- |
| CC0 1.0 | Thumbs (default), Notionists, Notionists neutral, Lorelei, Open Peeps, Pixel art, Identicon, Shapes, Rings, Glass, Initials |
| Free for personal and commercial use | Bottts, Bottts neutral, Avataaars |

## Captcha

Both public POST endpoints (accounts, reports) call `verifyCaptcha()` (`src/server/captcha.ts`).

| Variable | Value |
| --- | --- |
| `CAPTCHA_PROVIDER` | `none` (default) or `turnstile` |
| `TURNSTILE_SITE_KEY` | Public site key; required when the provider is `turnstile` |
| `TURNSTILE_SECRET_KEY` | Secret key, server only, never logged; required when the provider is `turnstile` (the environment check rejects the configuration without both keys) |

With `turnstile`, the form renders the Cloudflare Turnstile widget and the server verifies each token with Cloudflare's `siteverify` endpoint (5 s timeout, sends the client IP as `remoteip`). It **fails closed**: a missing or oversized token, a missing secret, a timeout, a network error or any answer other than `success: true` refuses the request with `403 CAPTCHA_FAILED`. A rejected secret is logged as an operator error. Only then does the CSP allow `https://challenges.cloudflare.com` (`script-src`, `connect-src`, `frame-src`); it is the only third party the site ever loads. With `none`, the forms rely on the rate limits alone and production logs a warning once.

## Admin settings and reports

**Admin → Site settings** (`/admin/settings`, permission `settings:manage`: Super Admin and Administrator) edits one JSON document in `site_settings`, validated by `src/lib/site-settings.ts` on every read and write. Changes reach every process within a few seconds (5 s settings cache, plus the catalogue's short cache) and are audited with the names of the changed sections.

| Section | Settings |
| --- | --- |
| General | Site name, tagline, search description |
| Announcement bar | On/off, text, tone (info/success/warning), optional link (site path or `https://` URL only) |
| Public display | Show server hostnames; show account statistics in the footer |
| Quotas & resets | Reset times (`HH:MM`, up to 24), time zone, default quota for new protocol rows (preview of the next reset) |
| Health monitor | Check interval, failures before offline |
| Avatars | DiceBear style with previews and licence |
| Contact | Support email, Telegram `https://t.me/…` link |
| Account rules | Up to 10 short rules shown next to every account form |

**Reports.** Visitors report a problem with a category (can't connect, slow or unstable, account not working, something else), a 10–2000 character message, an optional server and protocol and an optional reply email. The client IP is stored only as a keyed hash. **Admin → Reports** (`reports:view`; all four roles) lists them in Open / Resolved / All tabs; `reports:manage` resolves a report with an optional note (up to 500 characters) or reopens it, both audited. The open count appears as a badge in the admin navigation and as a dashboard tile.

The other admin additions (server URL names, per-protocol quotas, account avatars and revoke) are described in [Admin panel](03-admin-panel.md).

## Security notes

* **The browser never talks to a VPN server.** Listings, the status page and the public API carry no IP address, management API port or credential (`catalog.ts` does not select them); the hostname only when the admin enables it. The user's own one-time result contains what their app needs to connect (host and, for the SSH family, the server IP), never the management API port.
* **Predefined operations only.** The public API can only request an account on a published server; the worker turns that into the fixed `POST /accounts`; health checks use `GET /info` and `GET /health`; expiry uses `DELETE /accounts/<id>`. There is no endpoint that takes a command.
* **Public POST endpoints:** same-origin check (`Origin` must be the site), `application/json` only, body size limits enforced while streaming, strict zod schemas (unknown keys rejected), adapter guards on usernames and passwords (safe character sets, reserved names), rate limits keyed by `hashClientIp()` (HMAC with `IP_HASH_SECRET`, raw IPs are never stored), captcha failing closed.
* **No secrets at rest or in logs.** Form input and results are encrypted and erased (input when the request finishes, the result after its TTL); `vpn_accounts.metadata` holds only non-sensitive values; logs and event details pass through `redact()`. Public responses that may carry secrets are `no-store`.
* **Text stays text.** Admin-entered and node-provided text is rendered by React (escaped). The only raw HTML is the structured-data `<script>` in `json-ld.tsx`, whose JSON escapes `<`, `>` and `&`. Links from settings are validated on save and again when rendered (`safeHref()` in `src/lib/seo.ts`: a site path or an `https://` URL, never `javascript:`).
* **Self-hosted assets.** Fonts (`@fontsource-variable/inter`, `jetbrains-mono`), flags (`flag-icons`), QR codes (`qrcode`, in the browser) and avatars are all served from the site; CSP `font-src 'self' data:`, `img-src 'self' data: blob:`, nonce-based `script-src`.
* **Client IP.** Taken from `X-Forwarded-For` counting `TRUSTED_PROXY_HOPS` from the right; keep the app behind the reverse proxy so the header cannot be forged.

Tests: `tests/integration/{catalog,public-api,quota,monitoring,reports}.test.ts`, `tests/unit/{quota,reset-schedule,public-cache,public-browse,public-create,slug-avatar,captcha,proxy-csp,owner-adapters}.test.ts`.
