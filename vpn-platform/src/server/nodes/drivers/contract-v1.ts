import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import {
  nodeAccountEnvelopeWire,
  nodeAccountListWire,
  nodeHealthWire,
  nodeInfoWire,
  nodeProtocolsWire,
  nodeStatsWire,
  toNodeAccount,
  toNodeHealth,
  toNodeInfo,
  toNodeProtocol,
  toNodeStats,
  type CreateAccountWire,
} from "../contract";
import type { NodeDriver } from "../driver";
import { NodeError } from "../errors";
import { nodeRequest, type NodeConnection } from "../transport";

function parse<T extends z.ZodType>(schema: T, data: unknown, what: string, delivery: "processed" | "maybe" = "processed"): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new NodeError({
      kind: "protocol",
      code: "INVALID_RESPONSE",
      delivery,
      safeMessage: `The server's ${what} response did not match the API contract${
        first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""
      }.`,
    });
  }
  return r.data;
}

const idSegment = (id: string) => {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
    throw new NodeError({ kind: "config", code: "INVALID_ID", delivery: "not_sent", safeMessage: "Invalid account identifier." });
  }
  return encodeURIComponent(id);
};

function isNotFound(e: unknown) {
  return e instanceof NodeError && (e.code === "ACCOUNT_NOT_FOUND" || e.status === 404);
}

/** Driver for the normalized Node API contract v1 (docs/04-node-api-contract.md). */
export function contractV1Driver(conn: NodeConnection): NodeDriver {
  const call = (o: Omit<Parameters<typeof nodeRequest>[1], "requestId"> & { requestId?: string }) =>
    nodeRequest(conn, { ...o, requestId: o.requestId ?? randomUUID() });

  return {
    key: "contract-v1",

    async getInfo() {
      const res = await call({ method: "GET", path: "/info" });
      return { info: toNodeInfo(parse(nodeInfoWire, res.data, "server info")), latencyMs: res.latencyMs };
    },

    async getHealth() {
      const res = await call({ method: "GET", path: "/health" });
      return toNodeHealth(parse(nodeHealthWire, res.data, "health"));
    },

    async getProtocols() {
      try {
        const res = await call({ method: "GET", path: "/protocols" });
        return parse(nodeProtocolsWire, res.data, "protocols").protocols.map(toNodeProtocol);
      } catch (e) {
        if (e instanceof NodeError && (e.status === 404 || e.code === "NOT_SUPPORTED")) return null;
        throw e;
      }
    },

    async getStats() {
      try {
        const res = await call({ method: "GET", path: "/stats" });
        return toNodeStats(parse(nodeStatsWire, res.data, "stats"));
      } catch (e) {
        if (e instanceof NodeError && (e.status === 404 || e.code === "NOT_SUPPORTED")) return null;
        throw e;
      }
    },

    async createAccount(spec, requestId) {
      const body: CreateAccountWire = {
        request_id: requestId,
        protocol: spec.protocol,
        username: spec.username,
        password: spec.password,
        duration_days: spec.durationDays,
        options: spec.options,
      };
      const res = await call({
        method: "POST",
        path: "/accounts",
        body,
        requestId,
        idempotencyKey: requestId,
        timeoutMs: env().NODE_PROVISION_TIMEOUT_MS,
      });
      // A 2xx means the node created (or replayed) the account; a body we cannot parse is an
      // uncertain outcome, not a definite failure.
      const parsed = parse(nodeAccountEnvelopeWire, res.data, "create account", "maybe");
      return toNodeAccount(parsed.account, parsed.replayed);
    },

    async getAccount(accountId) {
      try {
        const res = await call({ method: "GET", path: `/accounts/${idSegment(accountId)}` });
        return toNodeAccount(parse(nodeAccountEnvelopeWire, res.data, "account").account);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },

    async findAccountByRequestId(requestId) {
      try {
        const res = await call({ method: "GET", path: `/accounts/by-request/${idSegment(requestId)}` });
        return toNodeAccount(parse(nodeAccountEnvelopeWire, res.data, "account lookup").account);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },

    async revokeAccount(accountId, requestId) {
      try {
        await call({ method: "DELETE", path: `/accounts/${idSegment(accountId)}`, requestId, idempotencyKey: requestId });
      } catch (e) {
        if (isNotFound(e)) return; // already gone
        throw e;
      }
    },

    async renewAccount(accountId, durationDays, requestId) {
      const res = await call({
        method: "POST",
        path: `/accounts/${idSegment(accountId)}/renew`,
        body: { request_id: requestId, duration_days: durationDays },
        requestId,
        idempotencyKey: requestId,
        timeoutMs: env().NODE_PROVISION_TIMEOUT_MS,
      });
      return toNodeAccount(parse(nodeAccountEnvelopeWire, res.data, "renew account", "maybe").account);
    },

    async listAccounts(params) {
      const res = await call({
        method: "GET",
        path: "/accounts",
        query: { protocol: params.protocol, cursor: params.cursor, limit: params.limit },
      });
      const parsed = parse(nodeAccountListWire, res.data, "account list");
      return { accounts: parsed.accounts.map((a) => toNodeAccount(a)), nextCursor: parsed.next_cursor ?? null };
    },

    async restartAgent() {
      await call({ method: "POST", path: "/agent/restart", body: { target: "agent" } });
    },
  };
}
