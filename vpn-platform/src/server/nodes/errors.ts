/**
 * Classified failures when talking to a node.
 *
 * `delivery` is what the provisioning lifecycle relies on to avoid duplicate accounts:
 *  - "not_sent":  the request certainly never reached the node (DNS, refused, TLS) → safe to retry.
 *  - "maybe":     it may have been processed (timeout after sending, connection reset) → the outcome
 *                 is uncertain; query the node by request id before any retry.
 *  - "processed": the node answered (success or a definite error).
 */
export type NodeErrorKind = "config" | "blocked" | "connect" | "tls" | "timeout" | "auth" | "http" | "protocol" | "remote";
export type Delivery = "not_sent" | "maybe" | "processed";

export class NodeError extends Error {
  readonly kind: NodeErrorKind;
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly delivery: Delivery;
  /** Message safe to show to administrators and store in logs (no secrets, no raw bodies). */
  readonly safeMessage: string;

  constructor(opts: {
    kind: NodeErrorKind;
    code: string;
    safeMessage: string;
    delivery: Delivery;
    retryable?: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(opts.safeMessage, { cause: opts.cause });
    this.name = "NodeError";
    this.kind = opts.kind;
    this.code = opts.code;
    this.status = opts.status;
    this.delivery = opts.delivery;
    this.retryable = opts.retryable ?? false;
    this.safeMessage = opts.safeMessage;
  }

  get isUncertain() {
    return this.delivery === "maybe";
  }
}

export function isNodeError(e: unknown): e is NodeError {
  return e instanceof NodeError;
}

const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EADDRNOTAVAIL",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const TLS_CODE_PREFIXES = ["ERR_TLS_", "CERT_", "UNABLE_TO_", "DEPTH_ZERO_", "SELF_SIGNED_", "ERR_SSL_", "HOSTNAME_MISMATCH"];

function errorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Turn a low-level transport exception into a NodeError. */
export function classifyTransportError(e: unknown, phase: { aborted: boolean }): NodeError {
  if (e instanceof NodeError) return e;
  const code = errorCode(e) ?? "UNKNOWN";

  if (CONNECT_CODES.has(code)) {
    return new NodeError({
      kind: code === "UND_ERR_CONNECT_TIMEOUT" ? "timeout" : "connect",
      code,
      delivery: "not_sent",
      retryable: true,
      safeMessage:
        code === "ENOTFOUND" || code === "EAI_AGAIN"
          ? "Server hostname could not be resolved."
          : code === "UND_ERR_CONNECT_TIMEOUT"
            ? "Timed out connecting to the server's management API."
            : "Could not connect to the server's management API (connection refused or unreachable).",
      cause: e,
    });
  }
  if (TLS_CODE_PREFIXES.some((p) => code.startsWith(p))) {
    return new NodeError({
      kind: "tls",
      code,
      delivery: "not_sent",
      safeMessage: `TLS verification failed (${code}). Check the certificate, hostname and TLS mode.`,
      cause: e,
    });
  }
  if (phase.aborted || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || code === "ABORT_ERR") {
    return new NodeError({
      kind: "timeout",
      code: "NODE_TIMEOUT",
      delivery: "maybe",
      retryable: true,
      safeMessage: "The server did not respond in time.",
      cause: e,
    });
  }
  // Socket closed / reset after the request may have been written.
  return new NodeError({
    kind: "connect",
    code,
    delivery: "maybe",
    retryable: true,
    safeMessage: "The connection to the server was interrupted.",
    cause: e,
  });
}
