import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractV1Driver } from "@/server/nodes/drivers/contract-v1";
import { NodeError } from "@/server/nodes/errors";
import { closeAllNodeAgents, type NodeConnection } from "@/server/nodes/transport";
import { startMockNode } from "../../mock-node/mock-node";

const SECRET = "transport-secret-0123456789abcdef";

function conn(port: number, over: Partial<NodeConnection> = {}): NodeConnection {
  return {
    serverId: `srv-${port}-${Math.random()}`,
    hostname: "node.test",
    ipAddress: "127.0.0.1",
    port,
    basePath: "/api/v1",
    credentialVersion: 1,
    auth: { method: "hmac_sha256", keyId: "mock-key", secret: SECRET },
    tls: { mode: "insecure_http" },
    ...over,
  };
}

async function expectNodeError(p: Promise<unknown>): Promise<NodeError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NodeError);
    return e as NodeError;
  }
  throw new Error("expected a NodeError");
}

describe("node transport (contract v1)", () => {
  let node: Awaited<ReturnType<typeof startMockNode>>;
  beforeAll(async () => {
    node = await startMockNode({ secret: SECRET, control: true });
  });
  afterAll(async () => {
    await node.close();
    await closeAllNodeAgents();
  });

  it("signs requests and parses /info (DNS pinned to the configured IP)", async () => {
    const { info } = await contractV1Driver(conn(node.port)).getInfo();
    expect(info.apiVersion).toBe("1.0");
    expect(info.capabilities.lookupByRequestId).toBe(true);
  });

  it("reports wrong credentials as an auth error that was processed", async () => {
    const e = await expectNodeError(contractV1Driver(conn(node.port, { auth: { method: "hmac_sha256", keyId: "mock-key", secret: "wrong-secret-000000000" } })).getInfo());
    expect(e.kind).toBe("auth");
    expect(e.delivery).toBe("processed");
  });

  it("classifies refused connections as not sent", async () => {
    const e = await expectNodeError(contractV1Driver(conn(1)).getInfo());
    expect(e.delivery).toBe("not_sent");
    expect(e.retryable).toBe(true);
  });

  it("classifies a timeout after sending as uncertain", async () => {
    node.state.createDelayMs = 3_000;
    const e = await expectNodeError(
      contractV1Driver(conn(node.port)).createAccount({ protocol: "ssh", username: "timeout_user", password: "S3cure-pass", durationDays: 1, options: {} }, crypto.randomUUID()),
    );
    node.state.createDelayMs = 0;
    expect(e.delivery).toBe("maybe");
  });

  it("returns null for unknown accounts and request ids", async () => {
    const d = contractV1Driver(conn(node.port));
    expect(await d.getAccount("acc_missing")).toBeNull();
    expect(await d.findAccountByRequestId(crypto.randomUUID())).toBeNull();
  });

  it("refuses private addresses unless explicitly allowed", async () => {
    process.env.ALLOW_PRIVATE_NODE_ADDRESSES = "false";
    const { resetEnvCache } = await import("@/server/env");
    resetEnvCache();
    try {
      const e = await expectNodeError(contractV1Driver(conn(node.port)).getInfo());
      expect(e.code).toBe("ADDRESS_BLOCKED");
    } finally {
      process.env.ALLOW_PRIVATE_NODE_ADDRESSES = "true";
      resetEnvCache();
    }
  });
});

describe("node transport TLS modes", () => {
  let node: Awaited<ReturnType<typeof startMockNode>>;
  let certPem: string;
  let fingerprint: string;
  let available = true;

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vl-tls-"));
    try {
      execFileSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
        "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"),
        "-subj", "/CN=node.test", "-addext", "subjectAltName=DNS:node.test",
      ], { stdio: "ignore" });
    } catch {
      available = false;
      return;
    }
    certPem = readFileSync(path.join(dir, "cert.pem"), "utf8");
    fingerprint = new X509Certificate(certPem).fingerprint256;
    node = await startMockNode({ secret: SECRET, tls: { cert: certPem, key: readFileSync(path.join(dir, "key.pem"), "utf8") } });
  });
  afterAll(async () => {
    await node?.close();
    await closeAllNodeAgents();
  });

  it("verifies a self-signed certificate against a custom CA", async ({ skip }) => {
    if (!available) skip();
    const { info } = await contractV1Driver(conn(node.port, { tls: { mode: "custom_ca", caPem: certPem } })).getInfo();
    expect(info.hostname).toBe("node.test");
  });

  it("accepts a pinned fingerprint and rejects a wrong one", async ({ skip }) => {
    if (!available) skip();
    await expect(contractV1Driver(conn(node.port, { tls: { mode: "pinned_fingerprint", pinnedFingerprintSha256: fingerprint } })).getInfo()).resolves.toBeTruthy();
    const e = await expectNodeError(
      contractV1Driver(conn(node.port, { tls: { mode: "pinned_fingerprint", pinnedFingerprintSha256: "AA".repeat(32) } })).getInfo(),
    );
    expect(e.kind).toBe("tls");
    expect(e.delivery).toBe("not_sent");
  });

  it("rejects an untrusted certificate with the system CA store", async ({ skip }) => {
    if (!available) skip();
    const e = await expectNodeError(contractV1Driver(conn(node.port, { tls: { mode: "system_ca" } })).getInfo());
    expect(e.kind).toBe("tls");
  });
});
