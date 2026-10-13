# Vaultline — VPN/SSH account platform

A website + admin panel that turns servers prepared with **your existing installation script** into publicly available SSH / V2Ray / WireGuard / OpenVPN / … account generators — with no code change per server.

> **Status:** PRD phases 1–9 are implemented and tested (database, admin auth, dashboard, server management, Add Server workflow, connection test, capability detection, protocol management, provisioning interface/adapters/lifecycle). **Real provisioning is paused until the server script is analysed** — see [docs/08-server-script-intake.md](docs/08-server-script-intake.md). The brand name is a placeholder (`NEXT_PUBLIC_SITE_NAME`).

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

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (build also bundles worker + scripts into `dist/`) |
| `npm run worker` | Provisioning worker (BullMQ) |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle migrations; idempotent protocol seed |
| `npm run admin:create -- --email … --role super_admin` | Create an admin or reset a password (`ADMIN_PASSWORD` env or hidden prompt) |
| `npm run mock-node` | Development node simulator |
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
