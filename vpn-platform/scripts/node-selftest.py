#!/usr/bin/env python3
"""
Self-test for a VPN node API, run ON the VPS itself (Python 3 standard library only).

    python3 node-selftest.py --url https://de1.example.com:9443/api/v1 [--fingerprint <sha256 hex>]
    python3 node-selftest.py --url ... --protocols ssh,vless     # default: every protocol /info reports

The key id and secret are read from /etc/vpn-node-api/config.json (or the VPN_NODE_KEY_ID and
VPN_NODE_SECRET environment variables); they are never printed.

What it checks:
  1. Signing: unsigned, wrong-secret, 10-minute-old and replayed requests are refused.
  2. GET /info, /health, /protocols have the fields the website expects.
  3. Unsafe usernames ("root", "a; reboot") are refused with VALIDATION_FAILED.
  4. Per protocol: create a 1-day test account, retry with the same request id (must return the same
     account), reuse the request id with other details (must be refused), look it up by request id,
     check the config keys the website reads, delete it, delete again (must be 404).
  5. No VPN service restarted during the test, i.e. no connected user was disconnected.
Secrets in responses (passwords, UUIDs, keys, share links) are masked in the output.
"""
import argparse
import hashlib
import hmac
import http.client
import json
import os
import re
import secrets
import ssl
import subprocess
import sys
import time
import uuid
from urllib.parse import quote, urlsplit

CONFIG_PATH = "/etc/vpn-node-api/config.json"
SSH_FAMILY = {"ssh", "ssh-ssl", "slowdns", "ssh-websocket", "udp-custom"}
SECRET_KEYS = {"password", "uuid", "auth", "private_key", "preshared_key", "obfs_password", "secret", "token", "id"}
URI_SCHEMES = ("vmess://", "vless://", "trojan://", "ss://", "hysteria://", "hysteria2://", "hy2://")
# Config keys the website reads per protocol (docs/10-script-api-prompt.md, section 8).
EXPECTED = {
    "ssh": ["host", "username", "password", "ports"],
    "ssh-ssl": ["host", "username", "password", "ports"],
    "slowdns": ["host", "username", "password", "slowdns.nameserver", "slowdns.public_key"],
    "vmess": ["host", "uuid", "connections|links"],
    "vless": ["host", "uuid", "connections|links"],
    "trojan": ["host", "password", "connections|links"],
    "hysteria": ["host", "port", "auth", "uri"],
    "hysteria2": ["host", "port", "password", "uri"],
    "zivpn": ["host", "password", "ports"],
}
SERVICE_PATTERN = re.compile(r"(ssh|dropbear|stunnel|xray|v2ray|hysteria|zivpn|dnstt|slowdns|udp|badvpn|ws|websocket|trojan|nginx|haproxy)", re.I)

results = []


def record(name, ok, note=""):
    results.append((name, ok))
    print(f"  {'✓' if ok else '✗'} {name}" + (f" — {note}" if note else ""))


def find_value(obj, patterns):
    """Depth-first search of a JSON config for the first key matching one of the regexes."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (str, int)) and any(re.fullmatch(p, k, re.I) for p in patterns):
                return str(v)
        for v in obj.values():
            found = find_value(v, patterns)
            if found:
                return found
    return None


def load_credentials():
    key_id = os.environ.get("VPN_NODE_KEY_ID")
    secret = os.environ.get("VPN_NODE_SECRET")
    if (not key_id or not secret) and os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
        key_id = key_id or find_value(cfg, [r"key_?id", r"api_?key_?id"])
        secret = secret or find_value(cfg, [r"(api_|hmac_)?secret", r"secret_?key"])
    if not key_id or not secret:
        sys.exit(f"Could not find the key id and secret in {CONFIG_PATH}; set VPN_NODE_KEY_ID and VPN_NODE_SECRET.")
    return key_id, secret


class Client:
    def __init__(self, url, key_id, secret, fingerprint):
        u = urlsplit(url)
        self.scheme, self.host, self.base = u.scheme, u.hostname, u.path.rstrip("/")
        self.port = u.port or (443 if u.scheme == "https" else 80)
        self.key_id, self.secret = key_id, secret
        self.fingerprint = (fingerprint or "").replace(":", "").lower() or None
        if self.scheme == "https":
            self.ctx = ssl.create_default_context()
            if self.fingerprint:  # self-signed certificate: trust it by its pinned fingerprint instead
                self.ctx.check_hostname = False
                self.ctx.verify_mode = ssl.CERT_NONE

    def sign(self, method, path, body, secret=None, ts=None):
        ts = str(ts if ts is not None else int(time.time()))
        nonce = secrets.token_hex(16)
        canonical = "\n".join(["VL1-HMAC-SHA256", method.upper(), path, ts, nonce, hashlib.sha256(body).hexdigest()])
        sig = hmac.new((secret or self.secret).encode(), canonical.encode(), hashlib.sha256).hexdigest()
        return {"X-Node-Key-Id": self.key_id, "X-Node-Timestamp": ts, "X-Node-Nonce": nonce, "X-Node-Signature": "v1=" + sig}

    def call(self, method, path, body=None, sign=True, secret=None, ts=None, headers=None, idem=None):
        full = self.base + path
        raw = b"" if body is None else json.dumps(body).encode()
        h = dict(headers) if headers else (self.sign(method, full, raw, secret, ts) if sign else {})
        h["X-Request-Id"] = str(uuid.uuid4())
        if raw:
            h["Content-Type"] = "application/json"
        if idem:
            h["Idempotency-Key"] = idem
        if self.scheme == "https":
            conn = http.client.HTTPSConnection(self.host, self.port, context=self.ctx, timeout=60)
        else:
            conn = http.client.HTTPConnection(self.host, self.port, timeout=60)
        conn.connect()
        if self.scheme == "https" and self.fingerprint:
            got = hashlib.sha256(conn.sock.getpeercert(binary_form=True)).hexdigest()
            if got != self.fingerprint:
                conn.close()
                sys.exit(f"TLS certificate fingerprint mismatch: expected {self.fingerprint}, got {got}. Not sending anything.")
        started = time.time()
        conn.request(method, full, body=raw or None, headers=h)
        resp = conn.getresponse()
        text = resp.read().decode("utf-8", "replace")
        conn.close()
        try:
            data = json.loads(text)
        except ValueError:
            data = None
        return {"status": resp.status, "json": data, "text": text, "headers": h, "ms": int((time.time() - started) * 1000)}


def err_code(r):
    j = r["json"]
    return j.get("error", {}).get("code") if isinstance(j, dict) and j.get("ok") is False else None


def data_of(r):
    j = r["json"]
    return j.get("data") if isinstance(j, dict) and j.get("ok") is True else None


def mask(value, key=""):
    if isinstance(value, dict):
        return {k: mask(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v, key) for v in value]
    if isinstance(value, str):
        if value.startswith(URI_SCHEMES):
            return value.split("://")[0] + "://… (" + str(len(value)) + " chars)"
        if key.lower() in SECRET_KEYS or len(value) > 120:
            return f"•••• ({len(value)} chars)"
    return value


def has_key(cfg, dotted):
    for alt in dotted.split("|"):
        cur = cfg
        for part in alt.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur not in (None, "", [], {}):
            return True
    return False


def services_snapshot():
    try:
        out = subprocess.run(["systemctl", "list-units", "--type=service", "--state=running", "--no-legend", "--plain"],
                             capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    snap = {}
    for line in out.splitlines():
        unit = line.split()[0] if line.split() else ""
        if not unit.endswith(".service") or not SERVICE_PATTERN.search(unit) or unit.startswith("vpn-node-api"):
            continue
        show = subprocess.run(["systemctl", "show", unit, "-p", "ActiveEnterTimestampMonotonic", "-p", "MainPID"],
                              capture_output=True, text=True, timeout=10).stdout
        snap[unit] = show.strip().replace("\n", " ")
    return snap


def account_test(c, protocol):
    print(f"\nAccount test: {protocol}")
    username = "chk" + secrets.token_hex(3)
    body = {"request_id": str(uuid.uuid4()), "protocol": protocol, "username": username, "duration_days": 1, "options": {}}
    if protocol in SSH_FAMILY:
        body["password"] = "Chk" + secrets.token_urlsafe(10).replace("-", "a").replace("_", "b")
    rid = body["request_id"]
    r = c.call("POST", "/accounts", body, idem=rid)
    d = data_of(r)
    acc = (d or {}).get("account") if isinstance(d, dict) else None
    if r["status"] != 201 or not isinstance(acc, dict) or not acc.get("account_id"):
        record("create account", False, f"HTTP {r['status']} {err_code(r) or ''} {r['text'][:200]}")
        return
    record("create account", True, f"HTTP 201 in {r['ms']} ms, account {acc['account_id']}, user {acc.get('username')}, expires {acc.get('expires_at')}")
    for k in ("account_id", "protocol", "status", "expires_at", "config"):
        if k not in acc:
            record(f"account has '{k}'", False)

    again = c.call("POST", "/accounts", body, idem=rid)
    a2 = (data_of(again) or {}).get("account") or {}
    record("retry with the same request id returns the same account",
           again["status"] == 200 and (data_of(again) or {}).get("replayed") is True and a2.get("account_id") == acc["account_id"],
           f"HTTP {again['status']}, replayed={(data_of(again) or {}).get('replayed')}")

    conflict = c.call("POST", "/accounts", dict(body, username=username + "x"), idem=rid)
    record("same request id with other details is refused", conflict["status"] == 409 and err_code(conflict) == "IDEMPOTENCY_CONFLICT",
           f"HTTP {conflict['status']} {err_code(conflict) or ''}")
    stray = (data_of(conflict) or {}).get("account") or {}
    if stray.get("account_id") and stray["account_id"] != acc["account_id"]:
        c.call("DELETE", "/accounts/" + quote(stray["account_id"], safe=""), idem=str(uuid.uuid4()))
        print("    (deleted the extra account the conflict test created)")

    look = c.call("GET", "/accounts/by-request/" + rid)
    la = (data_of(look) or {}).get("account") or {}
    record("lookup by request id finds it", look["status"] == 200 and la.get("account_id") == acc["account_id"], f"HTTP {look['status']}")

    cfg = acc.get("config") or {}
    expected = EXPECTED.get(protocol, ["host"])
    missing = [k for k in expected if not has_key(cfg, k)]
    record("config has the keys the website reads", not missing, "missing: " + ", ".join(missing) if missing else ", ".join(expected))
    bad_uris = [v for v in json.dumps(cfg).split('"') if "://" in v and not v.startswith(URI_SCHEMES + ("http://", "https://"))]
    if bad_uris:
        record("share links use known schemes", False, ", ".join(u.split("://")[0] for u in bad_uris))
    print("    config (secrets masked):")
    for line in json.dumps(mask(cfg), indent=2, ensure_ascii=False).splitlines():
        print("      " + line)

    d1 = c.call("DELETE", "/accounts/" + quote(acc["account_id"], safe=""), idem=str(uuid.uuid4()))
    record("delete account", d1["status"] == 200 and (data_of(d1) or {}).get("revoked") is True, f"HTTP {d1['status']} {err_code(d1) or ''}")
    d2 = c.call("DELETE", "/accounts/" + quote(acc["account_id"], safe=""), idem=str(uuid.uuid4()))
    record("second delete says not found", d2["status"] == 404, f"HTTP {d2['status']} {err_code(d2) or ''}")


def main():
    ap = argparse.ArgumentParser(description="Self-test for the VPN node API (run on the VPS).")
    ap.add_argument("--url", required=True, help="e.g. https://de1.example.com:9443/api/v1")
    ap.add_argument("--fingerprint", help="SHA-256 fingerprint of the API's self-signed certificate")
    ap.add_argument("--protocols", help="comma-separated protocol ids (default: all reported by /info)")
    args = ap.parse_args()
    key_id, secret = load_credentials()
    c = Client(args.url, key_id, secret, args.fingerprint)
    print(f"Node API self-test: {args.url} (key id {key_id})\n")
    before = services_snapshot()

    print("Authentication")
    try:
        r = c.call("GET", "/info", sign=False)
    except (OSError, ssl.SSLError) as e:
        record("API reachable", False, f"{e}. If the certificate is self-signed, pass --fingerprint.")
        return
    record("unsigned request is refused", r["status"] == 401, f"HTTP {r['status']} {err_code(r) or ''}")
    r = c.call("GET", "/info", secret=secret + "x")
    record("wrong secret is refused", r["status"] == 401 and err_code(r) == "INVALID_SIGNATURE", f"HTTP {r['status']} {err_code(r) or ''}")
    r = c.call("GET", "/info", ts=int(time.time()) - 600)
    record("10-minute-old timestamp is refused", r["status"] == 401 and err_code(r) == "CLOCK_SKEW", f"HTTP {r['status']} {err_code(r) or ''}")
    first = c.call("GET", "/info")
    record("valid signature is accepted", first["status"] == 200, f"HTTP {first['status']} {err_code(first) or ''}")
    again = c.call("GET", "/info", headers=first["headers"])
    record("replayed nonce is refused", again["status"] == 401 and err_code(again) == "REPLAYED_NONCE", f"HTTP {again['status']} {err_code(again) or ''}")

    print("\nServer information")
    info = data_of(first) or {}
    need = ["api_version", "agent_version", "hostname", "protocols", "capabilities"]
    record("GET /info has the expected fields", all(k in info for k in need),
           f"api {info.get('api_version')}, agent {info.get('agent_version')}, status {info.get('status')}, hostname {info.get('hostname')}")
    print(f"    protocols: {', '.join(info.get('protocols') or []) or '(none)'}")
    print(f"    capabilities: {json.dumps(info.get('capabilities'))}")
    h = c.call("GET", "/health")
    hd = data_of(h) or {}
    record("GET /health works", h["status"] == 200 and "status" in hd, f"status {hd.get('status')}, services {json.dumps(hd.get('services'))}")
    p = c.call("GET", "/protocols")
    pd = data_of(p) or {}
    record("GET /protocols works", p["status"] == 200 and isinstance(pd.get("protocols"), list),
           ", ".join(f"{x.get('id')}{'' if x.get('running', True) else ' (stopped)'}" for x in pd.get("protocols") or []))

    print("\nInput validation")
    proto0 = next((x for x in (info.get("protocols") or []) if x in SSH_FAMILY), (info.get("protocols") or ["ssh"])[0])
    for bad in ("root", "a; reboot"):
        body = {"request_id": str(uuid.uuid4()), "protocol": proto0, "username": bad, "password": "Abcdef123456", "duration_days": 1, "options": {}}
        r = c.call("POST", "/accounts", body, idem=body["request_id"])
        record(f"username {bad!r} is refused", r["status"] == 422 and err_code(r) == "VALIDATION_FAILED", f"HTTP {r['status']} {err_code(r) or ''}")
        acc = (data_of(r) or {}).get("account") or {}
        if acc.get("account_id"):
            c.call("DELETE", "/accounts/" + quote(acc["account_id"], safe=""), idem=str(uuid.uuid4()))

    targets = [x.strip() for x in args.protocols.split(",")] if args.protocols else list(info.get("protocols") or [])
    for protocol in targets:
        account_test(c, protocol)

    print("\nNo-disconnect check")
    after = services_snapshot()
    if not before:
        record("VPN services were not restarted", False, "could not read systemd services (run as root)")
    else:
        changed = [u for u in before if after.get(u) != before[u]]
        record("VPN services were not restarted", not changed,
               f"{len(before)} services watched" + (f"; restarted: {', '.join(changed)}" if changed else ""))


if __name__ == "__main__":
    try:
        main()
    finally:
        failed = [n for n, ok in results if not ok]
        print(f"\n{len(results) - len(failed)}/{len(results)} checks passed" + (f"; failed: {'; '.join(failed)}" if failed else ""))
