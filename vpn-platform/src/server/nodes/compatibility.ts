import semver from "semver";
import type { ServerCompatibility } from "@/server/db/schema";
import { NODE_API_CURRENT_MINOR, NODE_API_MAJOR, NODE_API_MIN_MINOR } from "./contract";

export interface CompatibilityResult {
  compatibility: ServerCompatibility;
  reasons: string[];
}

/**
 * Decide whether a node's reported versions are usable.
 *  - unsupported: different API major (or a minor older than the minimum) → cannot publish or provision.
 *  - outdated:    usable, but the agent/script is older than NODE_AGENT_LATEST_VERSION or the API
 *                 minor is behind → "SERVER SCRIPT OUTDATED" in the admin panel.
 */
export function evaluateCompatibility(
  apiVersion: string | null | undefined,
  agentVersion: string | null | undefined,
  latestAgentVersion: string,
): CompatibilityResult {
  if (!apiVersion) return { compatibility: "unknown", reasons: ["The server has not reported an API version yet."] };
  const m = /^(\d+)\.(\d+)$/.exec(apiVersion.trim());
  if (!m) return { compatibility: "unsupported", reasons: [`Unrecognised API version "${apiVersion}".`] };
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major !== NODE_API_MAJOR) {
    return {
      compatibility: "unsupported",
      reasons: [`Server speaks API ${apiVersion}; this website supports ${NODE_API_MAJOR}.x.`],
    };
  }
  if (minor < NODE_API_MIN_MINOR) {
    return {
      compatibility: "unsupported",
      reasons: [`Server API ${apiVersion} is older than the minimum supported ${NODE_API_MAJOR}.${NODE_API_MIN_MINOR}.`],
    };
  }
  const reasons: string[] = [];
  if (minor < NODE_API_CURRENT_MINOR) reasons.push(`Server API ${apiVersion} is behind the current ${NODE_API_MAJOR}.${NODE_API_CURRENT_MINOR}.`);
  const agent = agentVersion ? semver.coerce(agentVersion) : null;
  const latest = semver.coerce(latestAgentVersion);
  if (agent && latest && semver.lt(agent, latest)) {
    reasons.push(`Server script ${agentVersion} is older than the latest ${latestAgentVersion}.`);
  }
  return reasons.length ? { compatibility: "outdated", reasons } : { compatibility: "compatible", reasons: [] };
}
