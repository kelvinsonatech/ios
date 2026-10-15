# Deploying the website on a VPS

This guide puts the website (public site, admin panel, background worker, PostgreSQL, Redis and
HTTPS) on **one VPS** with Docker. Your VPN servers stay separate; the website calls their node
APIs.

```
Visitor ──HTTPS──▶ Website VPS (Caddy → web, worker, PostgreSQL, Redis) ──signed API calls──▶ VPN servers
```

**What has been tested:** `docker compose config` with this repository's files, the production
server exactly as the container runs it (`node server.js` from the standalone build, plus the bundled
migration script), and the client-IP handling behind Caddy and behind Cloudflare (unit tests). The
full `docker compose up --build` could not run in the development sandbox (no network access for
builds there), so your first deployment is its first real run. If a step fails, keep the output
and look at **Troubleshooting** below.

---

## 1. What you need

| | |
|---|---|
| VPS | Ubuntu 24.04, 2 vCPU, 2–4 GB RAM, 40 GB disk, **not** one of your VPN servers |
| Domain | for example bought at Hostinger |
| Optional | a free Cloudflare account (DDoS protection) |

Never paste passwords, keys or API secrets into a chat. You type them on the server or in the
admin panel.

## 2. Prepare the server (once)

Log in as root (`ssh root@YOUR_VPS_IP`), then:

```bash
apt update && apt -y upgrade
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
curl -fsSL https://get.docker.com | sh
```

The swap file stops the first build from running out of memory on a 2 GB server.

Docker's published ports bypass `ufw`. Only Caddy publishes ports (80 and 443); never add a
`ports:` entry to `postgres`, `redis`, `web` or `worker` in `docker-compose.yml`.

## 3. Point the domain at the server

In Hostinger hPanel → **Domains → your domain → DNS / Nameservers → DNS records**:

| Type | Name | Points to |
|---|---|---|
| A | `@` | your VPS IP |
| CNAME | `www` | `yourdomain.com` |

Delete any older A record for `@` (Hostinger's parking page). Wait until `ping yourdomain.com`
shows your VPS IP; that can take a few minutes to a few hours.

If you use Cloudflare, change the nameservers in hPanel to the two Cloudflare gives you and create
the same records in Cloudflare with the cloud **grey (DNS only)** for now. Section 9 turns the
proxy on.

## 4. Download the website

```bash
git clone -b claude/exciting-shannon-tr0xle https://github.com/kelvinsonatech/ios.git /opt/ios
cd /opt/ios/vpn-platform
cp .env.example .env
```

(Once the work is merged, clone the default branch instead of `claude/exciting-shannon-tr0xle`.)

## 5. Settings and secrets

Generate the secrets on the server, then set your domain:

```bash
sed -i "s|^APP_ENCRYPTION_KEYS=.*|APP_ENCRYPTION_KEYS=k1:$(openssl rand -base64 32)|" .env
sed -i "s|^IP_HASH_SECRET=.*|IP_HASH_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
nano .env
```

In `nano`, change:

* `APP_URL=https://yourdomain.com`
* `SITE_DOMAIN=yourdomain.com`

Leave `ALLOW_INSECURE_NODE_HTTP` and `ALLOW_PRIVATE_NODE_ADDRESSES` at `false` in production.

**Back up `.env` somewhere safe (not in the repository).** `APP_ENCRYPTION_KEYS` decrypts the stored
VPN server secrets; without it they are unreadable and every server has to be set up again.

## 6. Start everything

```bash
docker compose up -d --build
docker compose ps
```

The first build takes 5–10 minutes. `docker compose ps` should show `postgres`, `redis`, `web`,
`worker` and `caddy` running and `migrate` exited with code 0 (it applies database migrations and
seeds the protocol list, then stops). Caddy gets the HTTPS certificate automatically; open
`https://yourdomain.com`.

## 7. Create your admin login

```bash
docker compose run --rm migrate node dist/scripts/create-admin.mjs --email you@example.com --name "Your Name" --role super_admin
```

It asks for the password with the input hidden and rejects weak ones. Then open
`https://yourdomain.com/admin`, log in and turn on two-factor authentication when the dashboard
asks.

## 8. Set up the site

1. **Admin → Site settings:** site name, tagline, announcement, slot reset times and time zone,
   avatar style, contact details, rules. "Show server hostnames" is off by default (the hostname is
   also your node API's address); turn it on only if you want hostnames on the public listings.
2. **Captcha (recommended before you advertise the site):** create a Turnstile widget in the
   Cloudflare dashboard for your domain, then in `.env` set `CAPTCHA_PROVIDER=turnstile`,
   `TURNSTILE_SITE_KEY=…` and `TURNSTILE_SECRET_KEY=…`, and run `docker compose up -d`. Without it
   the public forms are protected by rate limits only.
3. **Admin → Servers → Add server**, for each VPN server: the node API URL, key ID, API secret and
   certificate fingerprint. Then **Test connection**, enable the protocols, set slots (quota) and
   **Publish**.
4. **On each VPN server:** set the API's allowed website IPv4 to this VPS's IP and remove any
   temporary test allowance. If an API secret was ever shared in a chat, generate a new one first
   and enter the new one in the admin panel.
5. Create one test account per protocol on the public site and connect with an app.

## 9. Optional: Cloudflare in front

1. Wait until the site works over `https://` with the grey cloud (Caddy has its certificate).
2. In `.env`: change `TRUSTED_PROXY_HOPS=1` to `TRUSTED_PROXY_HOPS=2` and uncomment
   `CADDYFILE=./deploy/Caddyfile.cloudflare`. Run `docker compose up -d`.
3. In Cloudflare: switch the `@` and `www` records to **Proxied (orange)** and set
   **SSL/TLS → Full (strict)**.

Why step 2 matters: behind Cloudflare every request reaches the server from a Cloudflare address.
`deploy/Caddyfile.cloudflare` trusts only Cloudflare's published ranges to pass on the visitor's
IP, and `TRUSTED_PROXY_HOPS=2` tells the app where to find it, so rate limits keep working per
visitor. A request that bypasses Cloudflare cannot fake its IP. Compare the ranges in that file with
<https://www.cloudflare.com/ips> once in a while.

Keep the DNS records of your **VPN servers** on grey (DNS only): Cloudflare's proxy only carries
web traffic, so SSH, SlowDNS and UDP protocols would break behind it.

## 10. Updating

```bash
cd /opt/ios && git pull
cd vpn-platform && docker compose up -d --build
```

`migrate` runs again on every `up` and applies new migrations before `web` and `worker` start.

## 11. Backups

```bash
cd /opt/ios/vpn-platform
docker compose exec -T postgres pg_dump -U vaultline vaultline | gzip > /root/vaultline-$(date +%F).sql.gz
```

Copy the file and `.env` off the server regularly. To restore on a fresh install (same `.env`),
start only the database first, load the backup, then start the rest:

```bash
docker compose up -d postgres
gunzip -c /root/vaultline-DATE.sql.gz | docker compose exec -T postgres psql -U vaultline vaultline
docker compose up -d --build
```

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| Browser shows a certificate error | `docker compose logs caddy`: the domain must point at this VPS and ports 80/443 must be open. |
| Site does not load | `docker compose ps`; `docker compose logs web` |
| `migrate` exited with an error | `docker compose logs migrate` (usually a wrong `POSTGRES_PASSWORD` after the database was first created with another one) |
| Accounts stay "Creating…" | `docker compose logs worker` |
| Test connection fails | On the VPN server: is the API running, and is this VPS's IP allowed in its firewall? |
| Build stops with "killed" | Not enough memory: check the swap file from step 2. |
