# 4. Normalized server (node) API contract — v1

This is the interface the website expects from the **provisioning service on each VPN server**. It is a *contract*, not a description of your existing script: nothing here assumes how your script creates users, which commands it runs or where it keeps files.

Two ways to satisfy it (the owner's servers use **A**: a node API built from [10-script-api-prompt.md](10-script-api-prompt.md), which also lists the exact `config` keys per protocol):

* **A — Agent on the server:** a small service on each VPS implements these endpoints by calling your script's existing functions. The website keeps using the built-in `contract-v1` driver.
* **B — Driver on the website:** if your script already exposes an API, a new `NodeDriver` translates the website's predefined operations to that API (`servers.driver` selects it per server). The node keeps its API untouched.

Machine-readable schemas: [`src/server/nodes/contract.ts`](../src/server/nodes/contract.ts). Reference signature verification: [`src/server/nodes/signing.ts`](../src/server/nodes/signing.ts). A working simulator: [`mock-node/mock-node.ts`](../mock-node/mock-node.ts).

## Transport

* `https://<hostname>:<api_port><api_base_path>` — default base path `/api/v1`.
* The website connects to the **IP configured in the admin panel** (DNS is pinned to it) and verifies TLS for the hostname (or the configured SNI override).
* TLS options per server: public CA (e.g. Let's Encrypt), custom CA / self-signed certificate (PEM), pinned SHA-256 certificate fingerprint, optional mutual TLS client certificate. Plain HTTP is development-only and refused in production unless explicitly allowed.
* JSON only (`Content-Type: application/json`), responses ≤ 1 MiB, no redirects.

## Authentication — per-server credentials

Every server has its own secret (never one global credential). Preferred: **HMAC-SHA256 signed requests**.

| Header | Value |
| --- | --- |
| `X-Node-Key-Id` | Key identifier configured for this server (lets the node rotate keys) |
| `X-Node-Timestamp` | Unix seconds |
| `X-Node-Nonce` | 32 hex chars, random per request |
| `X-Node-Signature` | `v1=` + hex HMAC-SHA256(secret, canonical string) |
| `X-Request-Id` | UUID for tracing |
| `Idempotency-Key` | Provisioning request id (create / renew / revoke) |

Canonical string (newline-separated):

```
VL1-HMAC-SHA256
<METHOD>
<path including base path and query string, exactly as sent, e.g. /api/v1/accounts?protocol=vless>
<timestamp>
<nonce>
<hex SHA-256 of the raw body; SHA-256 of "" when empty>
```

The node **must** reject: unknown key ids, timestamps more than **300 s** from its clock (run NTP), reused nonces within that window, and signature mismatches (constant-time comparison). Alternative for simple setups: `Authorization: Bearer <token>` (still per server, still HTTPS).

## Envelope

```json
{ "ok": true,  "data": { … } }
{ "ok": false, "error": { "code": "USERNAME_TAKEN", "message": "Username already exists", "retryable": false } }
```

An error envelope means **the operation did not happen** (atomic): no account was created/changed. Error codes:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHORIZED`, `INVALID_SIGNATURE`, `CLOCK_SKEW`, `REPLAYED_NONCE` | 401 | Authentication failed |
| `VALIDATION_FAILED` | 422 | Bad input |
| `PROTOCOL_UNAVAILABLE` | 422/409 | Protocol not installed / not running |
| `USERNAME_TAKEN` | 409 | Username exists |
| `CAPACITY_REACHED` | 409 | Node-side limit |
| `ACCOUNT_NOT_FOUND` | 404 | Unknown account or request id |
| `IDEMPOTENCY_CONFLICT` | 409 | Same request id reused with a different payload |
| `REQUEST_IN_PROGRESS` | 409 | Same request id still being processed (retryable) |
| `NOT_SUPPORTED` | 404/501 | Optional operation not implemented |
| `PROVISIONING_FAILED`, `INTERNAL` | 500 | Definite failure |

## Endpoints

### `GET /info` — server information *(required)*

```json
{
  "ok": true,
  "data": {
    "api_version": "1.0",
    "agent_version": "1.0.0",
    "status": "online",
    "hostname": "sg01.example.com",
    "public_ip": "203.0.113.10",
    "country": "SG",
    "server_time": "2026-10-13T12:00:00Z",
    "protocols": ["ssh", "ssh-websocket", "ssh-stunnel", "slowdns", "udp-custom", "openvpn", "wireguard", "shadowsocks", "vmess", "vless", "trojan", "noobzvpn"],
    "capabilities": {
      "idempotency": true,
      "lookup_by_request_id": true,
      "renew": true,
      "list_accounts": true,
      "restart_agent": false,
      "expiry_managed_by_node": true
    }
  }
}
```

* `api_version` `MAJOR.MINOR`. The website supports major `1`; another major is **unsupported** (cannot publish/provision). `agent_version` older than `NODE_AGENT_LATEST_VERSION` shows **SERVER SCRIPT OUTDATED**.
* `status`: `online` | `degraded` | `maintenance`.
* Protocol identifiers are free-form; the website maps them (see protocol `node_identifiers`).

### `GET /health` *(required)*

```json
{ "ok": true, "data": {
  "status": "online",
  "uptime_seconds": 86400,
  "cpu_percent": 12.5,
  "memory": { "used_bytes": 812000000, "total_bytes": 2048000000 },
  "disk": { "used_bytes": 9400000000, "total_bytes": 40000000000 },
  "load": [0.21, 0.18, 0.12],
  "services": { "ssh": "running", "xray": "running", "openvpn": "stopped" }
} }
```

### `GET /protocols` *(recommended; falls back to `/info.protocols`)*

```json
{ "ok": true, "data": { "protocols": [
  { "id": "vless", "installed": true, "running": true,
    "ports": { "tls": [443], "none": [80] }, "transports": ["ws", "grpc"],
    "current_accounts": 20, "max_accounts": null, "metadata": {} },
  { "id": "udp-custom", "installed": true, "running": true, "ports": { "udp_custom": "1-65535" } }
] } }
```

`ports` values are arrays of ports or a range string. They are used as defaults when an account response omits ports.

### `GET /stats` *(optional)*

```json
{ "ok": true, "data": { "accounts_total": 76, "accounts_by_protocol": { "ssh": 30, "vless": 20 }, "online_users": 12, "bandwidth": { "rx_bytes": 1e9, "tx_bytes": 4e9 } } }
```

### `POST /accounts` — create *(required)*

Request (website → node):

```json
{
  "request_id": "6c3f…-uuid",
  "protocol": "vless",
  "username": "traveller",
  "password": "S3cure-pass",
  "duration_days": 7,
  "options": { "transport": "ws" }
}
```

* `protocol` is the identifier the node itself reported during detection.
* `username` / `password` are present only when the protocol's form asks for them. They are pre-validated by the website (`^[a-z][a-z0-9_]{2,31}$` for system users and Hysteria/ZIVPN; `^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$` for VMess/VLESS/Trojan/Shadowsocks account names; passwords `[A-Za-z0-9@#%^*_+=.,:~-]{6,32}`; reserved names like `root` are refused). **The node must still never pass them through a shell.**
* **Idempotency:** the same `request_id` must return the same account (`"replayed": true`) and never create a second one; a different payload with the same id → `IDEMPOTENCY_CONFLICT`; if the first attempt is still running → `REQUEST_IN_PROGRESS`.

Response `201` (or `200` when replayed):

```json
{ "ok": true, "data": { "replayed": false, "account": {
  "account_id": "acc_8f2c…",
  "request_id": "6c3f…-uuid",
  "protocol": "vless",
  "username": "traveller",
  "status": "active",
  "created_at": "2026-10-13T12:00:00Z",
  "expires_at": "2026-10-20T12:00:00Z",
  "config": { … protocol-specific, see below … }
} } }
```

### `GET /accounts/by-request/{request_id}` *(required for safe retries)*

Returns the account created for that request id (same shape, including `config`) or `404 ACCOUNT_NOT_FOUND`. The website calls this after a timeout **before** any retry, so a slow server never produces two accounts.

### `GET /accounts/{account_id}`, `DELETE /accounts/{account_id}`, `POST /accounts/{account_id}/renew`

* `GET` → `{ "account": … }` (config may be omitted).
* `DELETE` → `{ "revoked": true }`; unknown/already removed → `404` (treated as success).
* `renew` body `{ "request_id": "…", "duration_days": 7 }` → `{ "account": … }` with the new `expires_at`.

### `GET /accounts?protocol=&cursor=&limit=` *(optional; not called by the website today)*

`{ "accounts": [ … ], "next_cursor": null }`

### `POST /agent/restart` *(optional; only if `capabilities.restart_agent`)*

Body `{ "target": "agent" }` → `202 { "accepted": true }`. A predefined operation — the node decides what "restart" means.

## Protocol `config` shapes the website understands

The server remains the authoritative source of protocol values; these are the keys the built-in adapters read (unknown keys are ignored, missing ports fall back to `/protocols`). For the owner's protocols they match section 8 of [10-script-api-prompt.md](10-script-api-prompt.md).

| Protocol(s) | `config` keys |
| --- | --- |
| SSH, SSH SSL, SSH WebSocket, SlowDNS, UDP Custom | `host`, `ip?`, `username?`, `password?`, `ports: { openssh, dropbear, ssl, ws, ws_tls, udp_custom, slowdns }`, `sni?`, `slowdns: { nameserver, public_key }`, `payload?` or `payloads?: [{ name, value }]` |
| VMess / VLESS / Trojan | `host`, `remark?`, `uuid` (VMess/VLESS) or `password` (Trojan), `alter_id?`, `flow?`, `connections: [{ name?, network, security, port, path?, host_header?, sni?, service_name?, uri? }]`, `links?: [{ name, uri }]` |
| Hysteria 1 | `host`, `ip?`, `port` (number, list or range), `protocol?`, `auth`, `obfs?`, `obfs_password?`, `up_mbps?`, `down_mbps?`, `alpn?`, `sni?`, `insecure?`, `uri?` (`hysteria://`) |
| Hysteria 2 | `host`, `ip?`, `port`, `password`, `obfs?: { type, password }`, `sni?`, `insecure?`, `pin_sha256?`, `uri?` (`hysteria2://` or `hy2://`) |
| ZIVPN UDP | `host`, `ip?`, `password`, `ports: { udp }` (e.g. `"6000-19999"`), `obfs?` |
| Shadowsocks | `host`, `port`, `method`, `password`, `plugin?`, `plugin_opts?`, `uri?` |
| WireGuard | `config_text?` or `interface: { address, dns?, private_key }` + `peer: { public_key, preshared_key?, endpoint, allowed_ips?, persistent_keepalive? }` |
| OpenVPN | `host`, `username?`, `password?`, `ports: { tcp, udp, ssl }`, `configs: [{ name, filename, content }]` or `ovpn` |
| NoobzVPN | `host`, `username?`, `password?`, `ports: { tcp, ssl }` |
| New protocols (generic adapter) | Anything; the admin maps dot-paths (e.g. `ports.tcp`) to output fields |

The website validates every value (types, lengths, no control characters, URI schemes, WireGuard key format, `.ovpn` shape) before showing it.

## Versioning rules

* Additive changes (new optional fields/endpoints) bump the **minor** version; the website ignores unknown fields.
* Breaking changes bump the **major** version; the website marks such servers unsupported until a matching driver/contract version exists.
* Optional features are announced through `capabilities`, not version numbers.

## Node-side security checklist

1. Listen on a dedicated port, firewall it to the website's IP(s).
2. Verify signatures + timestamp + nonce before parsing the body; reject bodies > 64 KiB.
3. Map each endpoint to a fixed internal function; **no endpoint executes caller-supplied commands**.
4. Re-validate usernames/passwords; call system tools with argument arrays (`execFile`/`spawn`), never a shell string.
5. Persist request ids (≥ 24 h) for idempotency and `by-request` lookups.
6. Never log passwords, keys or configs.
