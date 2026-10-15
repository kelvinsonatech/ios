# Vaultline — VPN/SSH account platform

A website + admin panel that turns servers prepared with **your existing installation script** into publicly available SSH / V2Ray / WireGuard / OpenVPN / … account generators — with no code change per server.

> **Status:** the admin panel, the public site (protocol → country → server → create account, server status, reports, my accounts, legal pages) and the provisioning pipeline are implemented and tested against the owner's node API (see [docs/10-script-api-prompt.md](docs/10-script-api-prompt.md); SSH, SSH SSL and SlowDNS verified on the owner's server; `npm run node:check` checks a real node end to end). Every VPN account and admin gets a locally generated DiceBear avatar. Roadmap: [docs/07-roadmap.md](docs/07-roadmap.md). The brand name comes from the admin site settings (default "Vaultline").

Design documents: [docs/](docs/README.md).

## Quick start (local development)

Requirements: Node.js ≥ 22.19, PostgreSQL 16, Redis 7 (or `docker compose -f docker-compose.dev.yml up -d`).

```bash
npm ci
cp .env.example .env            # generate APP_ENCRYPTION_KEYS / IP_HASH_SECRET as described inside
# for the mock node, also set: ALLOW_INSECURE_NODE_HTTP=true ALLOW_PRIVATE_NODE_ADDRESSES=true
npm run db:migrate && npm run db:seed
npm run admin:create -- --email you@example.com --name "Your Name" --role super_admin
npm run dev                     # http://localhost:3000/admin
npm run worker                  # second terminal: provisioning worker
```

### Try the full admin workflow without a VPS

```bash
MOCK_NODE_SECRET=dev-secret-0123456789abcdef npm run mock-node    # simulator on 127.0.0.1:8443
```

Admin → Servers → **Add server**: hostname `node.test`, IP `127.0.0.1`, API port `8443`, Key ID `mock-key`, the secret above, TLS mode *Plain HTTP (development only)* → **Connect server** → review detected protocols → **Publish**. Then `curl localhost:3000/api/public/protocols/vless` shows the server. Simulate installing a protocol and press **Sync**:

```bash
curl -XPOST localhost:8443/__mock/protocols -d '{"protocols":["ssh","vless","wireguard"]}'
```

The mock node is a **test simulator of the website's contract**, not a model of your script.

### Demo data

A whole demo fleet for QA and screenshots: 14 servers in 12 countries on 10 in-memory mock nodes (127.0.0.1:8451–8460) that answer like the owner's node API (`ssh`, `ssh-ssl`, `slowdns`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `zivpn`) with realistic latencies. Development only; both commands refuse `NODE_ENV=production`.

```bash
# .env needs ALLOW_INSECURE_NODE_HTTP=true and ALLOW_PRIVATE_NODE_ADDRESSES=true (CAPTCHA_PROVIDER=none is fine)
npm run demo:nodes              # terminal 1: keep running (Ctrl+C stops the nodes; their accounts are in memory)
npm run demo:seed               # terminal 2: idempotent, run again any time
npm run worker                  # terminal 3: account creation, health monitor (30 s tick), expiry
npm run dev                     # http://localhost:3000 and /admin
ADMIN_PASSWORD='choose-a-long-password' npm run admin:create -- --email admin@example.com --name Admin --role super_admin
```

`demo:seed` goes through the same services as the admin panel: demo site settings (announcement on, quota resets at 00:00 and 12:00 Asia/Bangkok, default quota 50), connect + sync + publish every demo server and enable its detected protocols (quota 50, ZIVPN without quota), simulated quota usage for the current window (Singapore 01 SSH is full, Germany 01 VLESS has one slot left), eight accounts created on the mock nodes (one revoked) and two problem reports. *Germany 02* is in maintenance, *USA 02* points at a closed port and shows offline, and *France 01* reports Hysteria as stopped. The only servers it ever removes (soft-delete) are leftover non-demo servers on a loopback address (`127.x`, `::1`) whose API port is a demo port (8450–8460), e.g. earlier manual tests against the demo nodes; every other server is left untouched, and a demo server whose name or URL name is already used by a server the seed did not create is skipped with a message. `MOCK_NODE_SECRET` (16+ characters) overrides the demo nodes' shared development secret; set it for both commands.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (build also bundles worker + scripts into `dist/`) |
| `npm run worker` | Provisioning worker (BullMQ) |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle migrations; idempotent protocol seed |
| `npm run admin:create -- --email … --role super_admin` | Create an admin or reset a password (`ADMIN_PASSWORD` env or hidden prompt) |
| `npm run mock-node` | Development node simulator |
| `npm run demo:nodes` / `demo:seed` | Demo fleet of mock nodes / idempotent demo data (development only, see *Demo data*) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm test` (`test:unit`, `test:integration`) | Vitest; integration needs PostgreSQL + Redis (`TEST_DATABASE_URL`, default `…/vaultline_test`; `TEST_REDIS_URL`, default Redis DB 15). The test database is wiped. |

## Deployment

```bash
cp .env.example .env   # set secrets, POSTGRES_PASSWORD, SITE_DOMAIN, APP_URL=https://SITE_DOMAIN
docker compose up -d --build
docker compose run --rm migrate node dist/scripts/create-admin.mjs --email you@example.com --role super_admin
```

One image runs three roles: `web` (Next.js standalone), `worker`, `migrate` (migrations + seed). Caddy terminates TLS (automatic certificates) and sets `X-Forwarded-For` (`TRUSTED_PROXY_HOPS=1`). Never expose the web container directly. Firewall each VPN server's API port to the website's IP.

## Project layout

See [docs/01-architecture.md § Folder structure](docs/01-architecture.md#folder-structure).
