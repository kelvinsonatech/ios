import type { NodeAccount, NodeHealth, NodeInfo, NodeProtocol, NodeStats } from "./contract";
import type { NodeConnection } from "./transport";

/** Protocol-specific, normalized account creation command produced by a ProtocolAdapter. */
export interface AccountSpec {
  /** Identifier of the protocol as the node knows it (server_protocols.node_identifier). */
  protocol: string;
  username?: string;
  password?: string;
  durationDays: number;
  /** Extra validated options, e.g. { transport: "ws" }. */
  options: Record<string, string>;
}

/**
 * The only way the website talks to a VPN server. A driver exposes a fixed set of predefined
 * operations — there is deliberately no "run command" method.
 *
 * `contract-v1` speaks the normalized Node API contract. When the real server script is analysed,
 * a different driver can be registered (servers.driver) without touching the rest of the app.
 */
export interface NodeDriver {
  readonly key: string;
  getInfo(): Promise<{ info: NodeInfo; latencyMs: number }>;
  getHealth(): Promise<NodeHealth>;
  /** Returns null when the node does not implement detailed protocol discovery. */
  getProtocols(): Promise<NodeProtocol[] | null>;
  getStats(): Promise<NodeStats | null>;
  createAccount(spec: AccountSpec, requestId: string): Promise<NodeAccount>;
  getAccount(accountId: string): Promise<NodeAccount | null>;
  /** Look up the result of a create request (used after an uncertain outcome). */
  findAccountByRequestId(requestId: string): Promise<NodeAccount | null>;
  revokeAccount(accountId: string, requestId: string): Promise<void>;
  renewAccount(accountId: string, durationDays: number, requestId: string): Promise<NodeAccount>;
  listAccounts(params: { protocol?: string; cursor?: string; limit?: number }): Promise<{
    accounts: NodeAccount[];
    nextCursor: string | null;
  }>;
  restartAgent(): Promise<void>;
}

export type NodeDriverFactory = (conn: NodeConnection) => NodeDriver;
