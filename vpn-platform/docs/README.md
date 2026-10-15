# Design documents

Answers to PRD §50 ("first produce …") plus the public site and the node API prompt, matching what is implemented in this repository. Progress: [Roadmap & status](07-roadmap.md).

| # | Document | Covers (PRD §50 items where applicable) |
| --- | --- | --- |
| 1 | [System architecture](01-architecture.md) | 2 system architecture · 11 folder structure |
| 2 | [PostgreSQL schema](02-database.md) | 3 schema |
| 3 | [Admin panel & Server Management](03-admin-panel.md) | 4 admin panel · 5 server management module |
| 4 | [Normalized server API contract](04-node-api-contract.md) | 6 provisioning interface · 8 server API contract |
| 5 | [Provisioning, adapters & lifecycle](05-provisioning.md) | 6 provisioning interface · 7 adapter architecture · 9 lifecycle |
| 6 | [Security boundaries](06-security.md) | 10 security boundaries |
| 7 | [Roadmap & status](07-roadmap.md) | 12 implementation roadmap |
| 8 | [Request: your server script](08-server-script-intake.md) | §43 — the STOP point before real provisioning (done: the owner's node API exists) |
| 9 | [Public site, quotas, monitoring & avatars](09-public-site.md) | Public pages and API, account creation → one-time result, creation quotas, health monitor, expiry, DiceBear avatars, captcha, site settings, reports |
| 10 | [Prompt: add a web API to your VPN script](10-script-api-prompt.md) | Copy-paste instructions for the AI tool that built your script: endpoints, signing, JSON formats, tests; section 12 explains the two checkers (`scripts/node-selftest.py` on the VPS, `npm run node:check` from the website side) |
| 11 | [Deploying the website on a VPS](11-deployment.md) | Step-by-step: VPS, Docker, domain (Hostinger), HTTPS, admin login, adding VPN servers, Cloudflare, updates, backups |
