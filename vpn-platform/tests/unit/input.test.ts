import { describe, expect, it } from "vitest";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import { buildInputSchema, toNormalizedInput } from "@/server/provisioning/input";
import { PROTOCOL_SEEDS } from "@/server/protocols/seed-data";
import type { ProtocolDefinition } from "@/server/provisioning/types";

function def(slug: string): ProtocolDefinition {
  const s = PROTOCOL_SEEDS.find((p) => p.slug === slug)!;
  return {
    id: slug,
    slug,
    name: s.name,
    adapterKey: s.adapterKey,
    durationOptions: s.durationOptions,
    defaultDurationDays: s.defaultDurationDays,
    outputFields: s.outputFields,
    fields: s.fields.map((f, i) => ({ ...f, displayOrder: i })),
  };
}

describe("dynamic protocol input validation", () => {
  const ssh = def("ssh");
  const schema = buildInputSchema(ssh, getAdapter(ssh.adapterKey));

  it("accepts valid input and lower-cases usernames", () => {
    const r = schema.parse({ username: "Alice_01", password: "S3cure-pass", duration: "7" });
    expect(toNormalizedInput(r, ssh)).toEqual({ username: "alice_01", password: "S3cure-pass", durationDays: 7, options: {} });
  });
  it.each([
    [{ username: "root", password: "S3cure-pass", duration: "7" }, "username"],
    [{ username: "alice", password: "pass word", duration: "7" }, "password"],
    [{ username: "alice", password: "abc$(reboot)", duration: "7" }, "password"],
    [{ username: "al", password: "S3cure-pass", duration: "7" }, "username"],
    [{ username: "alice;rm", password: "S3cure-pass", duration: "7" }, "username"],
    [{ username: "alice", password: "S3cure-pass", duration: "5" }, "duration"],
  ])("rejects %o", (input, field) => {
    const r = schema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path[0] === field)).toBe(true);
  });
  it("rejects undeclared fields", () => {
    expect(schema.safeParse({ username: "alice", password: "S3cure-pass", duration: "7", command: "id" }).success).toBe(false);
  });
  it("applies select options and defaults", () => {
    const vless = def("vless");
    const s = buildInputSchema(vless, getAdapter("vless"));
    expect(toNormalizedInput(s.parse({ username: "traveller", duration: "14" }), vless).options).toEqual({ transport: "ws" });
    expect(s.safeParse({ username: "traveller", duration: "14", transport: "quic" }).success).toBe(false);
  });
  it("WireGuard needs only a duration", () => {
    const wg = def("wireguard");
    expect(toNormalizedInput(buildInputSchema(wg, getAdapter("wireguard")).parse({ duration: "30" }), wg).durationDays).toBe(30);
  });
});
