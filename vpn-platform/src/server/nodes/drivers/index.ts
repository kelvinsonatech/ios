import type { NodeDriverFactory } from "../driver";
import { contractV1Driver } from "./contract-v1";

/**
 * Registered node drivers. `servers.driver` selects one per server.
 *
 * PHASE 11: once the existing server script has been analysed, register its driver here
 * (or implement the contract on the server and keep using "contract-v1").
 */
export const nodeDrivers: Record<string, { label: string; description: string; factory: NodeDriverFactory }> = {
  "contract-v1": {
    label: "Node API contract v1",
    description: "Signed HTTPS JSON API described in docs/04-node-api-contract.md.",
    factory: contractV1Driver,
  },
};

export const DEFAULT_DRIVER = "contract-v1";

export function getDriverFactory(key: string): NodeDriverFactory {
  const entry = nodeDrivers[key];
  if (!entry) throw new Error(`Unknown node driver "${key}"`);
  return entry.factory;
}
