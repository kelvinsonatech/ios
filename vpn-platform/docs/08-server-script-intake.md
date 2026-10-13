# 8. Request: your existing server script

Phases 1–9 are complete. Per the PRD, **real provisioning stops here until I have seen your script**. Nothing in this repository guesses commands, paths or output formats of your infrastructure — the website talks to servers only through the [contract](04-node-api-contract.md), and the mock node is a test simulator, not an agent.

## Please provide

1. **The installation/provisioning script(s)** — all files the installer downloads or creates (menu scripts, `add-*`/`del-*`/`renew-*` helpers, systemd units, cron jobs, Xray/V2Ray config templates).
2. **If the script already exposes an API:** its documentation or source — endpoints, authentication, request/response examples, error format.
3. **One real example output per protocol** you want to sell (redact secrets) — exactly what the script prints or writes after creating an SSH, VLESS, WireGuard, … account.
4. **Distribution and versions** you run (Ubuntu/Debian version, Xray version, etc.).

## What I will analyse (phase 10)

| Question | Why it matters |
| --- | --- |
| How accounts are created, per protocol (commands, functions, config edits) | The agent/driver must call the same trusted functions with argument arrays |
| How accounts are deleted / renewed | `revokeAccount` / `renewAccount` |
| How expiry works (cron? `chage`? Xray `expiry` field? manual) | Phase 19 strategy, `expiry_managed_by_node` |
| Which protocols and ports it installs; service names | Detection (`/info`, `/protocols`), protocol identifiers, port defaults |
| Where configuration and user data are stored | Account lookup, idempotency storage, `listAccounts` |
| Output format of each operation | Adapter `config` parsing (share links, WireGuard/OpenVPN files) |
| Existing API, authentication, versioning | Option B (driver) vs option A (agent) |
| How services are restarted/reloaded after a change | Agent operations; avoiding dropped connections |
| Concurrency safety (two creates at once) | Locking in the agent |

## Two integration paths

* **A — Thin agent (recommended if the script has no API):** a small, audited service on each VPS implementing the v1 contract by invoking the script's own functions (no shell interpolation, request-id storage for idempotency, signature verification). The website needs no driver change; only adapter parsing is aligned.
* **B — Driver (if the script already has a usable API):** a new `NodeDriver` in `src/server/nodes/drivers/` translating the predefined operations to that API. Your servers stay untouched.

Either way, the result is the PRD's target workflow: *buy VPS → run your script → Add Server → Connect → verify → detect → enable → publish → users create accounts* — with no website code change per server.
