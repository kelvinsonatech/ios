/**
 * Run the MOCK node locally (development only):
 *
 *   MOCK_NODE_SECRET=change-me-dev-secret-123 npm run mock-node
 *
 * Then add a server in the admin panel with IP 127.0.0.1, hostname node.test, port 8443,
 * TLS mode "Plain HTTP (development only)", key id "mock-key" and the same secret.
 * Requires ALLOW_INSECURE_NODE_HTTP=true and ALLOW_PRIVATE_NODE_ADDRESSES=true in the website's env.
 *
 * Optional: MOCK_NODE_PROTOCOLS=ssh,vless (default: the owner's nine protocol ids),
 * MOCK_NODE_LATENCY_MS=120 (artificial delay per answer), MOCK_NODE_EXPIRY_MANAGED=true.
 * For a whole demo fleet use `npm run demo:nodes` instead.
 */
import { startMockNode } from "./mock-node";

const secret = process.env.MOCK_NODE_SECRET;
if (!secret || secret.length < 16) {
  console.error("Set MOCK_NODE_SECRET (at least 16 characters).");
  process.exit(1);
}

const node = await startMockNode({
  port: Number(process.env.MOCK_NODE_PORT ?? 8443),
  host: process.env.MOCK_NODE_LISTEN ?? "127.0.0.1",
  hostname: process.env.MOCK_NODE_HOSTNAME ?? "node.test",
  keyId: process.env.MOCK_NODE_KEY_ID ?? "mock-key",
  secret,
  protocols: process.env.MOCK_NODE_PROTOCOLS?.split(",").map((s) => s.trim()).filter(Boolean),
  control: process.env.MOCK_NODE_CONTROL !== "false",
  latencyMs: Number(process.env.MOCK_NODE_LATENCY_MS ?? 0) || 0,
  expiryManagedByNode: process.env.MOCK_NODE_EXPIRY_MANAGED === "true",
});
console.log(`Mock node listening on http://127.0.0.1:${node.port}/api/v1 (key id ${process.env.MOCK_NODE_KEY_ID ?? "mock-key"})`);
console.log(`Simulate installing a protocol: curl -XPOST localhost:${node.port}/__mock/protocols -d '{"protocols":["ssh","wireguard"]}'`);
