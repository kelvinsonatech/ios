/**
 * Demo fleet of MOCK nodes for local QA and screenshots (development only):
 *
 *   npm run demo:nodes      # keep it running, then in another terminal: npm run demo:seed
 *
 * Starts one in-memory mock node per entry of scripts/demo-fleet.ts on 127.0.0.1:8451–8460, each
 * with its own protocol mix (the owner's protocol ids) and artificial latency. Accounts live in
 * memory only: restarting this script forgets them (the website then treats them as already gone).
 * Secret: MOCK_NODE_SECRET (16+ characters) or the fixed development default from demo-fleet.ts.
 */
import { startMockNode } from "../mock-node/mock-node";
import { DEMO_FLEET, DEMO_SECRET } from "./demo-fleet";

if (process.env.NODE_ENV === "production") {
  console.error("demo:nodes is for development only.");
  process.exit(1);
}

const running: { close: () => Promise<void> }[] = [];
for (const node of DEMO_FLEET) {
  const [primary, ...shared] = node.hosts;
  try {
    const mock = await startMockNode({
      port: node.port,
      host: "127.0.0.1",
      hostname: primary!.hostname,
      publicIp: "127.0.0.1",
      country: primary!.countryCode,
      keyId: primary!.keyId,
      secret: DEMO_SECRET,
      protocols: node.protocols,
      latencyMs: node.latencyMs,
      control: false,
      expiryManagedByNode: false,
      virtualHosts: Object.fromEntries(shared.map((h) => [h.keyId, { hostname: h.hostname, country: h.countryCode }])),
    });
    if (node.stopped?.length) mock.state.stopped = new Set(node.stopped);
    running.push(mock);
    const names = node.hosts.map((h) => h.name).join(", ");
    console.log(`  127.0.0.1:${node.port}  ${String(node.latencyMs).padStart(3)} ms  ${names}  [${node.protocols.join(" ")}]`);
  } catch (e) {
    console.error(`Could not start the mock node on port ${node.port}: ${(e as Error).message}`);
    await Promise.all(running.map((r) => r.close()));
    process.exit(1);
  }
}
console.log(`\n${running.length} demo nodes running. Next: npm run demo:seed (once), npm run worker and npm run dev. Ctrl+C stops the nodes.`);

// State is in memory only; keep-alive connections from the website must not delay the exit.
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
