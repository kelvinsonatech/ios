/**
 * Node API contract v1 — wire schemas.
 *
 * This is the normalized interface the website expects from the provisioning service running on
 * each VPN server (see docs/04-node-api-contract.md). It does NOT describe how the server-side
 * script works internally. Once the real script is analysed, either:
 *   (a) a small agent on the server implements this contract by calling the script, or
 *   (b) a new NodeDriver translates these operations to the script's existing API.
 *
 * Every response is untrusted input: it is size-limited by the transport, parsed here with strict
 * length limits, and converted to camelCase domain types.
 */
import { z } from "zod";

export const NODE_API_MAJOR = 1;
export const NODE_API_MIN_MINOR = 0;
export const NODE_API_CURRENT_MINOR = 0;
export const NODE_API_CURRENT = `${NODE_API_MAJOR}.${NODE_API_CURRENT_MINOR}`;

const shortText = z.string().trim().max(255);
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*$/, "invalid identifier");
const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const port = z.number().int().min(1).max(65535);
const nonNegInt = z.number().int().min(0);
const bytes = z.number().min(0).max(Number.MAX_SAFE_INTEGER);

/** Free-form metadata from the node: bounded depth/size, primitives only at leaves. */
const metadataValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(4096),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(metadataValue).max(64),
    z.record(z.string().max(64), metadataValue),
  ]),
);
const metadata = z.record(z.string().max(64), metadataValue).default({});

export const portMapSchema = z
  .record(
    z.string().trim().min(1).max(32),
    z.union([z.array(port).max(32), z.string().regex(/^\d{1,5}(-\d{1,5})?$/, "invalid port range")]),
  )
  .default({});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const nodeErrorBody = z.object({
  code: z.string().max(64).default("UNKNOWN"),
  message: z.string().max(500).default(""),
  retryable: z.boolean().default(false),
});

export const errorEnvelope = z.object({ ok: z.literal(false), error: nodeErrorBody });
export const successEnvelope = z.object({ ok: z.literal(true), data: z.unknown() });

/** Machine-readable error codes a node may return. Unknown codes are treated as PROVISIONING_FAILED. */
export const NodeErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  CLOCK_SKEW: "CLOCK_SKEW",
  REPLAYED_NONCE: "REPLAYED_NONCE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  PROTOCOL_UNAVAILABLE: "PROTOCOL_UNAVAILABLE",
  USERNAME_TAKEN: "USERNAME_TAKEN",
  CAPACITY_REACHED: "CAPACITY_REACHED",
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  /** Same request id is still being processed (retryable; the website will look it up later). */
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  PROVISIONING_FAILED: "PROVISIONING_FAILED",
  INTERNAL: "INTERNAL",
} as const;

// ---------------------------------------------------------------------------
// GET /info
// ---------------------------------------------------------------------------

export const nodeInfoWire = z.object({
  api_version: z.string().regex(/^\d{1,3}\.\d{1,3}$/, "api_version must look like 1.0"),
  agent_version: z.string().trim().min(1).max(64),
  status: z.enum(["online", "degraded", "maintenance"]).default("online"),
  hostname: shortText,
  public_ip: z.union([z.ipv4(), z.ipv6()]).optional(),
  country: z.string().trim().max(64).optional(),
  server_time: isoDate.optional(),
  protocols: z.array(identifier).max(64).default([]),
  capabilities: z
    .object({
      idempotency: z.boolean().default(false),
      lookup_by_request_id: z.boolean().default(false),
      renew: z.boolean().default(false),
      list_accounts: z.boolean().default(false),
      restart_agent: z.boolean().default(false),
      expiry_managed_by_node: z.boolean().default(false),
    })
    .default({
      idempotency: false,
      lookup_by_request_id: false,
      renew: false,
      list_accounts: false,
      restart_agent: false,
      expiry_managed_by_node: false,
    }),
});

export type NodeInfo = {
  apiVersion: string;
  agentVersion: string;
  status: "online" | "degraded" | "maintenance";
  hostname: string;
  publicIp?: string;
  country?: string;
  serverTime?: Date;
  protocols: string[];
  capabilities: {
    idempotency: boolean;
    lookupByRequestId: boolean;
    renew: boolean;
    listAccounts: boolean;
    restartAgent: boolean;
    expiryManagedByNode: boolean;
  };
};

export function toNodeInfo(w: z.infer<typeof nodeInfoWire>): NodeInfo {
  return {
    apiVersion: w.api_version,
    agentVersion: w.agent_version,
    status: w.status,
    hostname: w.hostname,
    publicIp: w.public_ip,
    country: w.country,
    serverTime: w.server_time,
    protocols: w.protocols,
    capabilities: {
      idempotency: w.capabilities.idempotency,
      lookupByRequestId: w.capabilities.lookup_by_request_id,
      renew: w.capabilities.renew,
      listAccounts: w.capabilities.list_accounts,
      restartAgent: w.capabilities.restart_agent,
      expiryManagedByNode: w.capabilities.expiry_managed_by_node,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

const usage = z.object({ used_bytes: bytes, total_bytes: bytes });

export const nodeHealthWire = z.object({
  status: z.enum(["online", "degraded", "offline"]).default("online"),
  uptime_seconds: nonNegInt.optional(),
  cpu_percent: z.number().min(0).max(100_000).optional(),
  memory: usage.optional(),
  disk: usage.optional(),
  load: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]).optional(),
  services: z.record(identifier, z.enum(["running", "stopped", "unknown"]).catch("unknown")).default({}),
});

export type NodeHealth = {
  status: "online" | "degraded" | "offline";
  uptimeSeconds?: number;
  cpuPercent?: number;
  memory?: { usedBytes: number; totalBytes: number };
  disk?: { usedBytes: number; totalBytes: number };
  load?: [number, number, number];
  services: Record<string, "running" | "stopped" | "unknown">;
};

export function toNodeHealth(w: z.infer<typeof nodeHealthWire>): NodeHealth {
  return {
    status: w.status,
    uptimeSeconds: w.uptime_seconds,
    cpuPercent: w.cpu_percent,
    memory: w.memory && { usedBytes: w.memory.used_bytes, totalBytes: w.memory.total_bytes },
    disk: w.disk && { usedBytes: w.disk.used_bytes, totalBytes: w.disk.total_bytes },
    load: w.load,
    services: w.services,
  };
}

// ---------------------------------------------------------------------------
// GET /protocols
// ---------------------------------------------------------------------------

export const nodeProtocolWire = z.object({
  id: identifier,
  installed: z.boolean().default(true),
  running: z.boolean().nullable().optional(),
  ports: portMapSchema,
  transports: z.array(z.string().trim().min(1).max(32)).max(16).default([]),
  current_accounts: nonNegInt.optional(),
  max_accounts: nonNegInt.nullable().optional(),
  metadata,
});

export const nodeProtocolsWire = z.object({ protocols: z.array(nodeProtocolWire).max(64) });

export type NodeProtocol = {
  id: string;
  installed: boolean;
  running: boolean | null;
  ports: Record<string, number[] | string>;
  transports: string[];
  currentAccounts?: number;
  maxAccounts?: number | null;
  metadata: Record<string, unknown>;
};

export function toNodeProtocol(w: z.infer<typeof nodeProtocolWire>): NodeProtocol {
  return {
    id: w.id,
    installed: w.installed,
    running: w.running ?? null,
    ports: w.ports,
    transports: w.transports,
    currentAccounts: w.current_accounts,
    maxAccounts: w.max_accounts,
    metadata: w.metadata,
  };
}

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

export const nodeStatsWire = z.object({
  accounts_total: nonNegInt.optional(),
  accounts_by_protocol: z.record(identifier, nonNegInt).default({}),
  online_users: nonNegInt.optional(),
  bandwidth: z.object({ rx_bytes: bytes, tx_bytes: bytes }).optional(),
});

export type NodeStats = {
  accountsTotal?: number;
  accountsByProtocol: Record<string, number>;
  onlineUsers?: number;
  bandwidth?: { rxBytes: number; txBytes: number };
};

export function toNodeStats(w: z.infer<typeof nodeStatsWire>): NodeStats {
  return {
    accountsTotal: w.accounts_total,
    accountsByProtocol: w.accounts_by_protocol,
    onlineUsers: w.online_users,
    bandwidth: w.bandwidth && { rxBytes: w.bandwidth.rx_bytes, txBytes: w.bandwidth.tx_bytes },
  };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const nodeAccountWire = z.object({
  account_id: z.string().trim().min(1).max(128),
  request_id: z.string().max(128).optional(),
  protocol: identifier,
  username: z.string().max(64).optional(),
  status: z.enum(["active", "expired", "revoked", "disabled"]).catch("active"),
  created_at: isoDate.optional(),
  expires_at: isoDate.optional(),
  /** Protocol-specific values; validated by the protocol adapter. */
  config: z.record(z.string().max(64), metadataValue).default({}),
});

export const nodeAccountEnvelopeWire = z.object({ account: nodeAccountWire, replayed: z.boolean().optional() });
export const nodeAccountListWire = z.object({
  accounts: z.array(nodeAccountWire).max(1000),
  next_cursor: z.string().max(256).nullable().optional(),
});

export type NodeAccount = {
  accountId: string;
  requestId?: string;
  protocol: string;
  username?: string;
  status: "active" | "expired" | "revoked" | "disabled";
  createdAt?: Date;
  expiresAt?: Date;
  config: Record<string, unknown>;
  replayed?: boolean;
};

export function toNodeAccount(w: z.infer<typeof nodeAccountWire>, replayed?: boolean): NodeAccount {
  return {
    accountId: w.account_id,
    requestId: w.request_id,
    protocol: w.protocol,
    username: w.username,
    status: w.status,
    createdAt: w.created_at,
    expiresAt: w.expires_at,
    config: w.config,
    replayed,
  };
}

/** Body of POST /accounts (website → node). */
export type CreateAccountWire = {
  request_id: string;
  protocol: string;
  username?: string;
  password?: string;
  duration_days: number;
  options: Record<string, string>;
};
