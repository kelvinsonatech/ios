import { describe, expect, it } from "vitest";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import { AdapterResponseError } from "@/server/provisioning/adapters/base";
import { applyBugHost } from "@/server/provisioning/adapters/v2ray";
import { buildInputSchema, toNormalizedInput } from "@/server/provisioning/input";
import { presentAccount, safeMetadata } from "@/server/provisioning/present";
import { upgradeOutputFields } from "@/server/protocols/seed";
import { PROTOCOL_SEEDS } from "@/server/protocols/seed-data";
import { matchProtocols } from "@/server/protocols/identifiers";
import type { AdapterContext, NormalizedAccountInput, ProtocolDefinition } from "@/server/provisioning/types";
import type { NodeAccount } from "@/server/nodes/contract";

/**
 * The owner's node API (docs/10-script-api-prompt.md section 8) and real outputs captured from his
 * server. Every protocol id his script reports must be parsed and presented correctly.
 */
function definition(slug: string): ProtocolDefinition {
  const s = PROTOCOL_SEEDS.find((p) => p.slug === slug)!;
  return {
    id: slug,
    slug,
    name: s.name,
    adapterKey: s.adapterKey,
    durationOptions: s.durationOptions,
    defaultDurationDays: s.defaultDurationDays,
    fields: s.fields.map((f, i) => ({ ...f, displayOrder: i })),
    outputFields: s.outputFields,
  };
}

function ctx(slug: string, ports: AdapterContext["serverProtocol"]["ports"] = {}): AdapterContext {
  return {
    protocol: definition(slug),
    server: { id: "s", name: "DE 01", hostname: "de1.example.com", ipAddress: "203.0.113.10" },
    serverProtocol: { nodeIdentifier: slug, ports, transports: [], metadata: {} },
  };
}

const input = (extra: Partial<NormalizedAccountInput> = {}): NormalizedAccountInput => ({
  username: "traveller",
  password: "S3cure-pass",
  durationDays: 7,
  options: {},
  ...extra,
});

const account = (config: Record<string, unknown>, extra: Partial<NodeAccount> = {}): NodeAccount => ({
  accountId: "acc_8f2c41d9",
  protocol: "x",
  username: "traveller",
  status: "active",
  expiresAt: new Date(Date.now() + 7 * 86_400_000),
  config,
  ...extra,
});

function present(slug: string, config: Record<string, unknown>, i = input(), ports = {}) {
  const c = ctx(slug, ports);
  const p = getAdapter(c.protocol.adapterKey).parseAccount(account(config), c, i);
  const shown = presentAccount(c.protocol, p, { id: "s", name: "DE 01" });
  const field = (k: string) => shown.fields.find((f) => f.key === k);
  return { p, shown, field, metadata: safeMetadata(c.protocol, p) };
}

const REAL_PAYLOAD = "GET / HTTP/1.1[crlf]Host: node1.example.com[crlf]Upgrade: websocket[crlf][crlf]";

describe("owner's protocol ids", () => {
  it("every id his script reports maps to a seeded protocol", () => {
    const ids = ["ssh", "ssh-ssl", "slowdns", "vmess", "vless", "trojan", "hysteria", "hysteria2", "zivpn"];
    const protocols = PROTOCOL_SEEDS.map((p) => ({ id: p.slug, slug: p.slug, nodeIdentifiers: p.nodeIdentifiers }));
    const { matches, unmapped } = matchProtocols(ids, protocols);
    expect(unmapped).toEqual([]);
    expect([...matches.values()].map((m) => m.protocol.slug).sort()).toEqual([...ids].sort());
    // Alternative spellings map too.
    const alt = matchProtocols(["hysteria1", "hy2", "zivpn-udp", "udp_zivpn", "hy1"], protocols);
    expect([...alt.matches.values()].map((m) => m.protocol.slug).sort()).toEqual(["hysteria", "hysteria2", "zivpn"]);
  });
});

describe("SSH family (real outputs)", () => {
  it("ssh shows ports and the payload as copyable multiline text", () => {
    const { field, metadata } = present("ssh", {
      host: "node1.example.com",
      ip: "203.0.113.10",
      username: "chk82ed70",
      password: "x",
      ports: { openssh: [22], dropbear: [109, 143], ws: [80], ws_tls: [443] },
      payload: REAL_PAYLOAD,
    });
    expect(field("host")?.value).toBe("node1.example.com");
    expect(field("ip")?.value).toBe("203.0.113.10");
    expect(field("username")?.value).toBe("chk82ed70");
    expect(field("password")).toMatchObject({ value: "x", sensitive: true });
    expect(field("openssh_ports")?.value).toBe("22");
    expect(field("dropbear_ports")?.value).toBe("109, 143");
    expect(field("ws_ports")?.value).toBe("80");
    expect(field("ws_tls_ports")?.value).toBe("443");
    expect(field("payload")).toMatchObject({ value: REAL_PAYLOAD, kind: "multiline", copyable: true, sensitive: false });
    expect(metadata).not.toHaveProperty("password");
  });

  it("ssh-ssl shows SSL ports, SNI and payload", () => {
    const { field, shown } = present("ssh-ssl", {
      host: "node1.example.com",
      ip: "203.0.113.10",
      username: "chk82ed70",
      password: "x",
      ports: { ssl: [443, 447], ws_tls: [443] },
      sni: "node1.example.com",
      payload: REAL_PAYLOAD,
    });
    expect(field("ssl_ports")?.value).toBe("443, 447");
    expect(field("ws_tls_ports")?.value).toBe("443");
    expect(field("sni")?.value).toBe("node1.example.com");
    expect(field("payload")?.value).toBe(REAL_PAYLOAD);
    expect(shown.fields.map((f) => f.key)).not.toContain("dropbear_ports");
  });

  it("slowdns shows nameserver, public key and both ports", () => {
    const { field } = present("slowdns", {
      host: "node1.example.com",
      ip: "203.0.113.10",
      username: "chk82ed70",
      password: "x",
      ports: { slowdns: [53], openssh: [22] },
      slowdns: { nameserver: "dns.example.com", public_key: "9f2c4be1a07d3e58c6b19a4d2f7e0c835b6a1d94e2f70c3b8a5d16e4f09b27c1" },
    });
    expect(field("slowdns_nameserver")?.value).toBe("dns.example.com");
    expect(field("slowdns_public_key")?.value).toBe("9f2c4be1a07d3e58c6b19a4d2f7e0c835b6a1d94e2f70c3b8a5d16e4f09b27c1");
    expect(field("slowdns_ports")?.value).toBe("53");
    expect(field("openssh_ports")?.value).toBe("22");
  });

  it("several payload templates are shown as named blocks", () => {
    const { field } = present("ssh-ssl", {
      host: "de1.example.com",
      payloads: [
        { name: "WS TLS", value: "GET wss://de1.example.com/ HTTP/1.1[crlf][crlf]" },
        { name: "Direct", value: "CONNECT [host_port] HTTP/1.1[crlf][crlf]" },
      ],
    });
    expect(field("payload")?.value).toBe("WS TLS:\nGET wss://de1.example.com/ HTTP/1.1[crlf][crlf]\n\nDirect:\nCONNECT [host_port] HTTP/1.1[crlf][crlf]");
  });

  it("ignores invalid hosts from the node", () => {
    const { field } = present("ssh-ssl", { host: "bad host!", sni: "javascript:alert(1)", ip: "999.1.1.1" });
    expect(field("host")?.value).toBe("de1.example.com");
    expect(field("sni")).toBeUndefined();
    expect(field("ip")?.value).toBe("203.0.113.10");
  });
});

describe("VMess / VLESS / Trojan (section 8 sample)", () => {
  const sample = {
    host: "de1.example.com",
    remark: "traveller",
    uuid: "0f8c1a3e-6b6d-4c6b-9a4e-6f2b2d1c0a11",
    alter_id: 0,
    connections: [
      { name: "WS TLS", network: "ws", security: "tls", port: 443, path: "/vless", host_header: "de1.example.com", sni: "de1.example.com" },
      { name: "WS", network: "ws", security: "none", port: 80, path: "/vless", host_header: "de1.example.com" },
      { name: "gRPC", network: "grpc", security: "tls", port: 443, service_name: "vless-grpc", sni: "de1.example.com" },
    ],
  };

  it("builds one QR link per connection", () => {
    const { p } = present("vless", sample);
    expect(p.artifacts.map((a) => a.label)).toEqual(["VLESS WS TLS", "VLESS WS", "VLESS gRPC"]);
    expect(p.artifacts.every((a) => a.qr && a.sensitive && a.content.startsWith("vless://"))).toBe(true);
  });

  it("sni_bug and sni_type are validated, kept away from the node and applied to the links", () => {
    const def = definition("vless");
    const adapter = getAdapter("vless");
    const schema = buildInputSchema(def, adapter);
    expect(schema.safeParse({ username: "traveller", transport: "ws", duration: "7", sni_bug: "not a host" }).success).toBe(false);
    expect(schema.safeParse({ username: "traveller", transport: "ws", duration: "7", sni_type: "bogus" }).success).toBe(false);
    const parsed = schema.parse({ username: "traveller", transport: "ws", duration: "7", sni_bug: "Cdn.Example.com", sni_type: "sni" });
    const normalized = toNormalizedInput(parsed as Record<string, unknown>, def);
    expect(normalized.options).toMatchObject({ sni_bug: "cdn.example.com", sni_type: "sni" });

    const spec = adapter.buildSpec(normalized, ctx("vless"));
    expect(spec.options).toEqual({ transport: "ws" }); // never sent to the node

    const { p, field } = present("vless", sample, normalized);
    const tls = new URL(p.artifacts[0]!.content);
    expect(tls.hostname).toBe("de1.example.com");
    expect(tls.searchParams.get("sni")).toBe("cdn.example.com");
    expect(tls.searchParams.get("host")).toBe("cdn.example.com");
    const plain = new URL(p.artifacts[1]!.content);
    expect(plain.searchParams.get("sni")).toBeNull();
    expect(plain.searchParams.get("host")).toBe("cdn.example.com");
    expect(field("bug_host")?.value).toMatch(/cdn\.example\.com/);
  });

  it("sni_type=address connects to the bug host and keeps the real server in SNI/Host", () => {
    const { p } = present("vless", sample, input({ options: { sni_bug: "cdn.example.com", sni_type: "address" } }));
    const u = new URL(p.artifacts[0]!.content);
    expect(u.hostname).toBe("cdn.example.com");
    expect(u.searchParams.get("sni")).toBe("de1.example.com");
    expect(u.searchParams.get("host")).toBe("de1.example.com");
  });

  it("VMess links are rewritten inside their base64 JSON; node links too", () => {
    const { p } = present("vmess", { ...sample, connections: sample.connections.slice(0, 1) }, input({ options: { sni_bug: "bug.example.net" } }));
    const json = JSON.parse(Buffer.from(p.artifacts[0]!.content.slice(8), "base64").toString());
    expect(json).toMatchObject({ add: "de1.example.com", sni: "bug.example.net", host: "bug.example.net" });

    const trojan = present("trojan", { host: "de1.example.com", password: "pw", links: [{ name: "WS TLS", uri: "trojan://pw@de1.example.com:443?security=tls&type=ws#t" }] }, input({ options: { sni_bug: "bug.example.net", sni_type: "address" } }));
    expect(new URL(trojan.p.artifacts[0]!.content).hostname).toBe("bug.example.net");
    expect(applyBugHost("vless", "not a url", { host: "x.example", mode: "sni" }, "h")).toBe("not a url");
  });
});

describe("Hysteria 1", () => {
  const sample = {
    host: "de1.example.com",
    ip: "203.0.113.10",
    port: 36712,
    protocol: "udp",
    auth: "auth-secret",
    obfs: "xplus",
    obfs_password: "obfs-secret",
    up_mbps: 100,
    down_mbps: 100,
    alpn: "hysteria",
    sni: "de1.example.com",
    insecure: true,
    uri: "hysteria://de1.example.com:36712?protocol=udp&auth=auth-secret&peer=de1.example.com&insecure=1&upmbps=100&downmbps=100&alpn=hysteria#traveller",
  };

  it("presents host, port, auth, obfs and SNI, and uses the node's link", () => {
    const { p, field, metadata } = present("hysteria", sample);
    expect(field("host")?.value).toBe("de1.example.com");
    expect(field("port")?.value).toBe("36712");
    expect(field("auth")).toMatchObject({ value: "auth-secret", sensitive: true });
    expect(field("obfs")?.value).toBe("xplus");
    expect(field("obfs_password")?.sensitive).toBe(true);
    expect(field("sni")?.value).toBe("de1.example.com");
    expect(field("insecure")?.value).toBe("Yes");
    expect(p.artifacts).toEqual([expect.objectContaining({ kind: "uri", qr: true, sensitive: true, content: sample.uri })]);
    expect(JSON.stringify(metadata)).not.toMatch(/auth-secret|obfs-secret/);
  });

  it("builds a valid share link when the node gives none", () => {
    const { p } = present("hysteria", { ...sample, uri: undefined });
    const u = new URL(p.artifacts[0]!.content);
    expect(u.protocol).toBe("hysteria:");
    expect(u.host).toBe("de1.example.com:36712");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      protocol: "udp",
      auth: "auth-secret",
      peer: "de1.example.com",
      insecure: "1",
      upmbps: "100",
      downmbps: "100",
      alpn: "hysteria",
      obfs: "xplus",
      obfsParam: "obfs-secret",
    });
  });

  it("refuses foreign link schemes and missing credentials", () => {
    const { p } = present("hysteria", { ...sample, uri: "javascript:alert(1)" });
    expect(p.artifacts[0]!.content).toMatch(/^hysteria:\/\/de1\.example\.com:36712\?/);
    expect(() => present("hysteria", { host: "h.example", port: 1 }, input({ password: undefined }))).toThrow(AdapterResponseError);
    expect(() => present("hysteria", { host: "h.example", auth: "a" })).toThrow(/port/);
  });
});

describe("Hysteria 2", () => {
  const sample = {
    host: "de1.example.com",
    ip: "203.0.113.10",
    port: 8443,
    password: "p@ss word",
    obfs: { type: "salamander", password: "obfs-secret" },
    sni: "de1.example.com",
    insecure: false,
  };

  it("builds the official hysteria2:// link with an encoded password", () => {
    const { p, field } = present("hysteria2", sample);
    expect(field("password")).toMatchObject({ value: "p@ss word", sensitive: true });
    expect(field("obfs")?.value).toBe("salamander");
    expect(field("port")?.value).toBe("8443");
    const link = p.artifacts[0]!.content;
    expect(link.startsWith("hysteria2://p%40ss%20word@de1.example.com:8443/?")).toBe(true);
    const u = new URL(link);
    expect(Object.fromEntries(u.searchParams)).toEqual({ sni: "de1.example.com", obfs: "salamander", "obfs-password": "obfs-secret", insecure: "0" });
    expect(u.hash).toBe("#traveller");
  });

  it("accepts hy2:// links from the node and port-hopping ranges", () => {
    expect(present("hysteria2", { ...sample, uri: "hy2://pw@de1.example.com:443/?sni=x#a" }).p.artifacts[0]!.content).toBe("hy2://pw@de1.example.com:443/?sni=x#a");
    const hop = present("hysteria2", { ...sample, port: "20000-50000" });
    expect(hop.field("port")?.value).toBe("20000-50000");
    expect(hop.p.artifacts[0]!.content).toContain("@de1.example.com:20000-50000/");
  });

  it("falls back to the user's password and the detected UDP port", () => {
    const { field } = present("hysteria2", { host: "de1.example.com" }, input(), { udp: [8443] });
    expect(field("password")?.value).toBe("S3cure-pass");
    expect(field("port")?.value).toBe("8443");
  });
});

describe("ZIVPN UDP", () => {
  it("shows host, password and the UDP port range", () => {
    const { field, shown, p } = present("zivpn", { host: "de1.example.com", ip: "203.0.113.10", password: "zi-pass", ports: { udp: "6000-19999" }, obfs: "zivpn" });
    expect(field("host")?.value).toBe("de1.example.com");
    expect(field("password")).toMatchObject({ value: "zi-pass", sensitive: true });
    expect(field("udp_ports")?.value).toBe("6000-19999");
    expect(field("obfs")?.value).toBe("zivpn");
    expect(shown.fields.map((f) => f.key)).not.toContain("ip");
    expect(p.artifacts).toEqual([]);
  });

  it("requires a password", () => {
    expect(() => present("zivpn", { host: "de1.example.com" }, input({ password: undefined }))).toThrow(AdapterResponseError);
  });

  it("optional password input: empty is fine, bad characters are not", () => {
    const def = definition("zivpn");
    const schema = buildInputSchema(def, getAdapter("zivpn"));
    expect(schema.safeParse({ username: "traveller", password: "", duration: "7" }).success).toBe(true);
    expect(schema.safeParse({ username: "traveller", password: "x y'z12", duration: "7" }).success).toBe(false);
  });
});

describe("seed upgrades for existing databases", () => {
  it("renames the old WebSocket payload output and adds SNI", () => {
    const old = [
      { key: "host", label: "Server host", kind: "text" as const, sensitive: false, copyable: true },
      { key: "ws_payload", label: "WebSocket payload", kind: "multiline" as const, sensitive: false, copyable: true, hidden: true },
    ];
    const next = upgradeOutputFields(old, "ssh-ssl")!;
    expect(next.map((f) => f.key)).toEqual(["host", "payload", "sni"]);
    expect(next[0]!.label).toBe("Server host"); // admin edits kept
    expect(next.find((f) => f.key === "payload")?.hidden).toBeFalsy();
    expect(upgradeOutputFields(next, "ssh-ssl")).toBeNull(); // idempotent
  });
});
