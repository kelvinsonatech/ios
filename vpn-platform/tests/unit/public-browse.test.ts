import { describe, expect, it } from "vitest";
import { describePorts, transportLabel } from "@/components/public/port-rows";
import { formatDayRange, formatDays, plural } from "@/components/public/format";
import { categoryLabel, groupProtocols } from "@/components/public/nav";
import { guideFamily, guideFor } from "@/lib/protocol-guides";
import { absoluteUrl, isExternalHref, mailtoHref, safeHref } from "@/lib/seo";

describe("safeHref (links from admin settings)", () => {
  it("keeps same-site paths and https links", () => {
    expect(safeHref("/server-status")).toBe("/server-status");
    expect(safeHref("/vless#guide")).toBe("/vless#guide");
    expect(safeHref("https://t.me/vaultline")).toBe("https://t.me/vaultline");
  });
  it("drops script, data, protocol-relative and plain http links", () => {
    for (const bad of ["javascript:alert(1)", " javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<b>x</b>", "//evil.example", "http://example.com", "/\\evil.example", "https://exa mple.com", ""]) {
      expect(safeHref(bad), bad).toBeNull();
    }
    expect(safeHref(null)).toBeNull();
  });
  it("only builds mailto: links from plain addresses", () => {
    expect(mailtoHref("help@example.com")).toBe("mailto:help@example.com");
    expect(mailtoHref("a@b.c?bcc=x@y.z")).toBeNull();
    expect(mailtoHref("a@b.c\r\nbcc:x@y.z")).toBeNull();
    expect(mailtoHref(null)).toBeNull();
  });
  it("marks external links and builds absolute URLs from APP_URL", () => {
    expect(isExternalHref("https://t.me/x")).toBe(true);
    expect(isExternalHref("/report")).toBe(false);
    expect(absoluteUrl("/vless")).toMatch(/^https?:\/\/[^/]+\/vless$/);
  });
});

describe("describePorts (node port maps)", () => {
  it("labels the owner's port keys in display order", () => {
    const rows = describePorts({ ws_tls: [443], ws: [80], dropbear: [109, 143], openssh: [22] });
    expect(rows.map((r) => `${r.label} ${r.value}`)).toEqual(["SSH 22", "Dropbear 109, 143", "WS TLS 443", "WS 80"]);
    expect(describePorts({ ssl: [443, 777] }).map((r) => `${r.label} ${r.value}`)).toEqual(["SSL 443, 777"]);
    expect(describePorts({ slowdns: [53, 5300], openssh: [22] }).map((r) => r.label)).toEqual(["SSH", "DNS"]);
    expect(describePorts({ udp: "6000-19999" })[0]).toMatchObject({ label: "UDP", value: "6000-19999" });
    expect(describePorts({ tls: [443], none: [80] }).map((r) => `${r.label} ${r.value}`)).toEqual(["TLS 443", "Non-TLS 80"]);
  });
  it("still lists unknown keys and skips empty values", () => {
    const rows = describePorts({ custom_port: [8080], empty: [], blank: " " });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "custom_port", label: "Custom Port", value: "8080" });
    expect(describePorts(null)).toEqual([]);
  });
  it("names transports", () => {
    expect(transportLabel("ws")).toBe("WebSocket");
    expect(transportLabel("grpc")).toBe("gRPC");
    expect(transportLabel("weird")).toBe("WEIRD");
  });
});

describe("protocol guides", () => {
  it("maps every protocol id of the owner's node script to a guide", () => {
    const expected: Record<string, string> = {
      ssh: "ssh",
      "ssh-ssl": "ssh-ssl",
      slowdns: "slowdns",
      vmess: "v2ray",
      vless: "v2ray",
      trojan: "trojan",
      hysteria: "hysteria",
      hysteria2: "hysteria2",
      zivpn: "zivpn",
    };
    for (const [slug, family] of Object.entries(expected)) expect(guideFamily(slug), slug).toBe(family);
  });
  it("falls back on keywords, then a generic guide", () => {
    expect(guideFamily("my-hy2", "Hysteria 2 fast")).toBe("hysteria2");
    expect(guideFamily("x-ray", "VLESS Reality")).toBe("v2ray");
    expect(guideFamily("mystery", "Mystery tunnel")).toBe("generic");
  });
  it("only links to https pages and has 3-5 steps", () => {
    for (const slug of ["ssh", "ssh-ssl", "slowdns", "vless", "trojan", "hysteria", "hysteria2", "zivpn", "wireguard", "openvpn", "shadowsocks", "noobzvpn", "x"]) {
      const g = guideFor(slug);
      expect(g.steps.length, slug).toBeGreaterThanOrEqual(3);
      expect(g.steps.length, slug).toBeLessThanOrEqual(5);
      for (const apps of Object.values(g.apps)) for (const app of apps ?? []) if (app.url) expect(app.url, `${slug} ${app.name}`).toMatch(/^https:\/\//);
    }
  });
});

describe("formatting and navigation helpers", () => {
  it("formats validity options and counts", () => {
    expect(formatDays([7, 3, 30, 14])).toBe("3, 7, 14 or 30 days");
    expect(formatDays([1])).toBe("1 day");
    expect(formatDayRange([30, 3, 7])).toBe("3–30 days");
    expect(plural(1, "server")).toBe("1 server");
    expect(plural(1200, "server")).toBe("1,200 servers");
  });
  it("labels and groups protocol categories in first-seen order", () => {
    expect(categoryLabel("v2ray")).toBe("V2Ray / Xray");
    expect(categoryLabel("udp_tunnels")).toBe("Udp Tunnels");
    const groups = groupProtocols([{ category: "ssh" }, { category: "v2ray" }, { category: "ssh" }]);
    expect(groups.map((g) => [g.category, g.items.length])).toEqual([
      ["ssh", 2],
      ["v2ray", 1],
    ]);
  });
});
