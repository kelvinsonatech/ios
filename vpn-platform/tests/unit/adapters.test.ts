import { describe, expect, it } from "vitest";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import { AdapterResponseError } from "@/server/provisioning/adapters/base";
import { presentAccount, safeMetadata } from "@/server/provisioning/present";
import type { AdapterContext, NormalizedAccountInput, ProtocolDefinition } from "@/server/provisioning/types";
import type { NodeAccount } from "@/server/nodes/contract";

function ctx(adapterKey: string, extra: Partial<AdapterContext["serverProtocol"]> = {}, def: Partial<ProtocolDefinition> = {}): AdapterContext {
  return {
    protocol: {
      id: "p",
      slug: adapterKey,
      name: adapterKey.toUpperCase(),
      adapterKey,
      durationOptions: [7],
      defaultDurationDays: 7,
      fields: [],
      outputFields: getAdapter(adapterKey).outputFields,
      ...def,
    },
    server: { id: "s", name: "SG 01", hostname: "sg01.example.com", ipAddress: "203.0.113.5" },
    serverProtocol: { nodeIdentifier: adapterKey, ports: {}, transports: [], metadata: {}, ...extra },
  };
}
const input: NormalizedAccountInput = { username: "traveller", password: "S3cure-pass", durationDays: 7, options: {} };
const account = (config: Record<string, unknown>, extra: Partial<NodeAccount> = {}): NodeAccount => ({
  accountId: "acc_1",
  protocol: "x",
  status: "active",
  expiresAt: new Date(Date.now() + 7 * 86_400_000),
  config,
  ...extra,
});

describe("SSH-family adapters", () => {
  it("presents ports from the account, falling back to detected ports", () => {
    const a = getAdapter("ssh");
    const c = ctx("ssh", { ports: { dropbear: [109, 143] } });
    const p = a.parseAccount(account({ host: "sg01.example.com", ports: { openssh: [22], ws: [80] } }), c, input);
    expect(p.values.openssh_ports?.value).toBe("22");
    expect(p.values.dropbear_ports?.value).toBe("109, 143");
    expect(p.values.password).toEqual({ value: "S3cure-pass", sensitive: true });
    expect(safeMetadata(c.protocol, p)).not.toHaveProperty("password");
  });

  it("builds the UDP Custom config string as a secret", () => {
    const a = getAdapter("udp-custom");
    const p = a.parseAccount(account({ host: "h.example", ports: { udp_custom: "1-65535" } }), ctx("udp-custom"), input);
    expect(p.values.udp_custom_config).toEqual({ value: "h.example:1-65535@traveller:S3cure-pass", sensitive: true });
  });

  it("hides fields that are not relevant to the variant", () => {
    const a = getAdapter("ssh-websocket");
    const c = ctx("ssh-websocket");
    const p = a.parseAccount(account({ ports: { openssh: [22], ws: [80] }, payload: "GET / HTTP/1.1" }), c, input);
    const shown = presentAccount(c.protocol, p, { id: "s", name: "SG" }).fields.map((f) => f.key);
    expect(shown).toContain("ws_ports");
    expect(shown).not.toContain("openssh_ports");
  });

  it("rejects control characters in node strings", () => {
    const p = getAdapter("ssh").parseAccount(account({ host: "evil\u0007host" }), ctx("ssh"), input);
    expect(p.values.host?.value).toBe("sg01.example.com");
  });
});

describe("V2Ray adapters", () => {
  const conns = [
    { name: "WS TLS", network: "ws", security: "tls", port: 443, path: "/vless", sni: "sg01.example.com" },
    { network: "grpc", security: "tls", port: 443, service_name: "vless-grpc" },
  ];
  it("builds VLESS share links when the node does not provide them", () => {
    const p = getAdapter("vless").parseAccount(account({ uuid: "0f8c1a3e-6b6d-4c6b-9a4e-6f2b2d1c0a11", connections: conns }), ctx("vless"), input);
    expect(p.artifacts).toHaveLength(2);
    expect(p.artifacts[0]!.content).toMatch(/^vless:\/\/0f8c1a3e-.*@sg01\.example\.com:443\?encryption=none&type=ws&security=tls&path=%2Fvless/);
    expect(p.artifacts[0]!.sensitive).toBe(true);
    expect(p.values.uuid?.sensitive).toBe(true);
    expect(p.values.tls_ports?.value).toBe("443");
  });
  it("encodes VMess links as base64 JSON", () => {
    const p = getAdapter("vmess").parseAccount(account({ uuid: "0f8c1a3e-6b6d-4c6b-9a4e-6f2b2d1c0a11", alter_id: 0, connections: conns.slice(0, 1) }), ctx("vmess"), input);
    const json = JSON.parse(Buffer.from(p.artifacts[0]!.content.slice(8), "base64").toString());
    expect(json).toMatchObject({ add: "sg01.example.com", port: "443", net: "ws", tls: "tls", path: "/vless" });
  });
  it("uses node-provided links verbatim but refuses foreign schemes", () => {
    const p = getAdapter("trojan").parseAccount(
      account({ password: "pw", connections: [{ network: "ws", security: "tls", port: 443, uri: "javascript:alert(1)" }], links: [{ name: "x", uri: "trojan://pw@h:443#a" }] }),
      ctx("trojan"),
      input,
    );
    expect(p.artifacts.map((a) => a.content)).not.toContain("javascript:alert(1)");
    expect(p.artifacts.map((a) => a.content)).toContain("trojan://pw@h:443#a");
  });
  it("refuses accounts without credentials or connections", () => {
    expect(() => getAdapter("vless").parseAccount(account({ connections: conns }), ctx("vless"), input)).toThrow(AdapterResponseError);
    expect(() => getAdapter("vless").parseAccount(account({ uuid: "0f8c1a3e-6b6d-4c6b-9a4e-6f2b2d1c0a11" }), ctx("vless"), input)).toThrow(AdapterResponseError);
  });
  it("rejects transports the server does not offer", () => {
    expect(() => getAdapter("vless").buildSpec({ ...input, options: { transport: "grpc" } }, ctx("vless", { transports: ["ws"] }))).toThrow(/does not offer/);
  });
});

describe("other adapters", () => {
  it("Shadowsocks builds a SIP002 link", () => {
    const p = getAdapter("shadowsocks").parseAccount(account({ host: "h", port: 8388, method: "chacha20-ietf-poly1305", password: "pw" }), ctx("shadowsocks"), input);
    expect(p.artifacts[0]!.content).toBe(`ss://${Buffer.from("chacha20-ietf-poly1305:pw").toString("base64url")}@h:8388#traveller`);
  });
  it("WireGuard assembles a config file with QR", () => {
    const key = Buffer.alloc(32, 3).toString("base64");
    const p = getAdapter("wireguard").parseAccount(
      account({ interface: { address: "10.66.66.2/32", dns: "1.1.1.1", private_key: key }, peer: { public_key: key, endpoint: "h:51820", persistent_keepalive: 25 } }),
      ctx("wireguard"),
      input,
    );
    const file = p.artifacts[0]!;
    expect(file).toMatchObject({ kind: "file", qr: true, sensitive: true, filename: "wg-traveller.conf" });
    expect(file.content).toContain("[Interface]\nPrivateKey = ");
    expect(file.content).toContain("PersistentKeepalive = 25");
    expect(p.values.private_key?.sensitive).toBe(true);
  });
  it("WireGuard rejects malformed keys", () => {
    expect(() =>
      getAdapter("wireguard").parseAccount(account({ interface: { address: "a", private_key: "not a key" }, peer: { public_key: "x", endpoint: "e" } }), ctx("wireguard"), input),
    ).toThrow(AdapterResponseError);
  });
  it("OpenVPN requires a real client profile", () => {
    const ok = getAdapter("openvpn").parseAccount(account({ configs: [{ name: "tcp", content: "client\nremote h 1194\n" }] }), ctx("openvpn"), input);
    expect(ok.artifacts[0]).toMatchObject({ kind: "file", filename: "SG_01-tcp.ovpn" });
    expect(() => getAdapter("openvpn").parseAccount(account({ ovpn: "<html>" }), ctx("openvpn"), input)).toThrow(AdapterResponseError);
  });
  it("generic adapter maps admin-defined paths", () => {
    const def = {
      outputFields: [
        { key: "server", label: "Server", kind: "text" as const, sensitive: false, copyable: true, path: "endpoint.host" },
        { key: "ports", label: "Ports", kind: "text" as const, sensitive: false, copyable: true, path: "endpoint.ports" },
        { key: "token", label: "Token", kind: "secret" as const, sensitive: true, copyable: true, path: "auth.token" },
        { key: "link", label: "Link", kind: "uri" as const, sensitive: true, copyable: true, path: "uri", qr: true },
      ],
    };
    const c = ctx("generic", {}, def);
    const p = getAdapter("generic").parseAccount(account({ endpoint: { host: "h", ports: [1, 2] }, auth: { token: "t" }, uri: "protox://abc" }), c, input);
    expect(p.values).toMatchObject({ server: { value: "h" }, ports: { value: "1, 2" }, token: { value: "t", sensitive: true } });
    expect(p.artifacts[0]).toMatchObject({ kind: "uri", content: "protox://abc" });
    expect(safeMetadata(c.protocol, p)).toEqual({ server: "h", ports: "1, 2", _artifacts: ["Link"] });
  });
});
