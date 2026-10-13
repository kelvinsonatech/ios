/**
 * PostgreSQL schema (Drizzle ORM).
 *
 * Design notes (see docs/02-database.md for the full rationale):
 *  - A server has an admin-controlled `lifecycle` (draft/active/maintenance/disabled) and an
 *    observed `health_status` (online/degraded/offline). The public-facing `status` is derived
 *    from both plus capacity by `computeServerStatus()` and stored denormalised for fast listing.
 *  - `server_protocols` is the auto-publishing table: a server appears on a protocol page iff
 *    the protocol is enabled globally, the node reported it (`detected`) and an admin enabled it.
 *  - Secrets (node API tokens, MFA secrets, client keys) are stored only as AES-256-GCM
 *    ciphertexts produced by `src/server/crypto/encryption.ts`.
 *  - Account rows never contain passwords, private keys or full configs; only safe metadata.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const adminRole = pgEnum("admin_role", ["super_admin", "administrator", "server_manager", "support"]);
export const serverLifecycle = pgEnum("server_lifecycle", ["draft", "active", "maintenance", "disabled"]);
export const serverHealthStatus = pgEnum("server_health_status", ["unknown", "online", "degraded", "offline"]);
export const serverStatus = pgEnum("server_status", ["pending", "online", "offline", "maintenance", "disabled", "full"]);
export const serverCompatibility = pgEnum("server_compatibility", ["unknown", "compatible", "outdated", "unsupported"]);
export const nodeAuthMethod = pgEnum("node_auth_method", ["hmac_sha256", "bearer_token"]);
export const nodeTlsMode = pgEnum("node_tls_mode", ["system_ca", "custom_ca", "pinned_fingerprint", "insecure_http"]);
export const accountStatus = pgEnum("account_status", ["pending", "active", "expired", "revoked", "failed"]);
export const provisioningOperation = pgEnum("provisioning_operation", ["create", "renew", "revoke"]);
export const provisioningState = pgEnum("provisioning_state", ["queued", "in_flight", "uncertain", "succeeded", "failed"]);
export const logLevel = pgEnum("log_level", ["info", "warning", "error"]);
export const protocolFieldType = pgEnum("protocol_field_type", ["text", "password", "select", "number", "duration"]);

export type AdminRole = (typeof adminRole.enumValues)[number];
export type ServerLifecycle = (typeof serverLifecycle.enumValues)[number];
export type ServerHealthStatus = (typeof serverHealthStatus.enumValues)[number];
export type ServerStatus = (typeof serverStatus.enumValues)[number];
export type ServerCompatibility = (typeof serverCompatibility.enumValues)[number];
export type NodeAuthMethod = (typeof nodeAuthMethod.enumValues)[number];
export type NodeTlsMode = (typeof nodeTlsMode.enumValues)[number];
export type AccountStatus = (typeof accountStatus.enumValues)[number];
export type ProvisioningOperation = (typeof provisioningOperation.enumValues)[number];
export type ProvisioningState = (typeof provisioningState.enumValues)[number];
export type LogLevel = (typeof logLevel.enumValues)[number];
export type ProtocolFieldType = (typeof protocolFieldType.enumValues)[number];

// ---------------------------------------------------------------------------
// JSON column types
// ---------------------------------------------------------------------------

export type OutputFieldKind = "text" | "secret" | "uri" | "multiline" | "file";

/** How a provisioned value is presented to the end user (admin-editable labels/order/visibility). */
export interface OutputFieldDefinition {
  key: string;
  label: string;
  kind: OutputFieldKind;
  /** Secret values are shown once to the user and never persisted in the database. */
  sensitive: boolean;
  copyable: boolean;
  hidden?: boolean;
  /** Generic adapter only: dot-path into the node's `config` object. */
  path?: string;
  /** Render a QR code for this value (URIs, WireGuard configs). */
  qr?: boolean;
  /** For kind=file: download filename, may contain {username}. */
  filename?: string;
}

export interface FieldValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface FieldOption {
  value: string;
  label: string;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Ports advertised by the node for a protocol, e.g. { "tls": [443], "none": [80], "udp": "1-65535" }. */
export type PortMap = Record<string, number[] | string>;

export interface NodeCapabilities {
  idempotency?: boolean;
  lookupByRequestId?: boolean;
  renew?: boolean;
  listAccounts?: boolean;
  restartAgent?: boolean;
  expiryManagedByNode?: boolean;
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Admins & sessions
// ---------------------------------------------------------------------------

export const admins = pgTable(
  "admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: adminRole("role").notNull().default("support"),
    isActive: boolean("is_active").notNull().default(true),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    /** Last accepted TOTP time-step; prevents replaying a code inside its window. */
    mfaLastUsedStep: bigint("mfa_last_used_step", { mode: "number" }),
    mfaRecoveryCodeHashes: text("mfa_recovery_code_hashes").array().notNull().default(sql`'{}'::text[]`),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: text("last_login_ip"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("admins_email_unique").on(sql`lower(${t.email})`)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque cookie token. The raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("admin_sessions_token_hash_unique").on(t.tokenHash), index("admin_sessions_admin_idx").on(t.adminId)],
);

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    hostname: text("hostname").notNull(),
    ipAddress: text("ip_address").notNull(),
    country: text("country").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    city: text("city"),
    region: text("region"),
    provider: text("provider"),
    apiPort: integer("api_port").notNull(),
    apiBasePath: text("api_base_path").notNull().default("/api/v1"),
    /** Which NodeDriver speaks to this server (see src/server/nodes/drivers). */
    driver: text("driver").notNull().default("contract-v1"),
    lifecycle: serverLifecycle("lifecycle").notNull().default("draft"),
    healthStatus: serverHealthStatus("health_status").notNull().default("unknown"),
    status: serverStatus("status").notNull().default("pending"),
    compatibility: serverCompatibility("compatibility").notNull().default("unknown"),
    maxAccounts: integer("max_accounts").notNull().default(100),
    currentAccounts: integer("current_accounts").notNull().default(0),
    /** Agent/script version reported by the node. */
    provisioningVersion: text("provisioning_version"),
    /** Node API contract version reported by the node, e.g. "1.0". */
    apiVersion: text("api_version"),
    reportedHostname: text("reported_hostname"),
    capabilities: jsonb("capabilities").$type<NodeCapabilities>().notNull().default({}),
    /** Protocol identifiers the node reported that no protocol maps to. */
    unmappedProtocols: text("unmapped_protocols").array().notNull().default(sql`'{}'::text[]`),
    /** Warnings from the last connect/sync (hostname/IP mismatch, clock skew, ...). */
    syncWarnings: text("sync_warnings").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastSuccessfulConnectionAt: timestamp("last_successful_connection_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    /** Safe, user-presentable description of the last failure. */
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("servers_name_unique").on(sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`),
    index("servers_status_idx").on(t.status),
    index("servers_lifecycle_idx").on(t.lifecycle),
    check("servers_max_accounts_positive", sql`${t.maxAccounts} > 0`),
    check("servers_current_accounts_non_negative", sql`${t.currentAccounts} >= 0`),
    check("servers_api_port_range", sql`${t.apiPort} between 1 and 65535`),
  ],
);

export const serverCredentials = pgTable(
  "server_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    authMethod: nodeAuthMethod("auth_method").notNull().default("hmac_sha256"),
    /** Public key identifier sent as X-Node-Key-Id (lets nodes rotate keys). */
    keyId: text("key_id"),
    /** AES-256-GCM ciphertext of the API secret / token. */
    secretEncrypted: text("secret_encrypted").notNull(),
    tlsMode: nodeTlsMode("tls_mode").notNull().default("system_ca"),
    /** Optional SNI / certificate hostname override (defaults to servers.hostname). */
    tlsServerName: text("tls_server_name"),
    caCertificatePem: text("ca_certificate_pem"),
    pinnedFingerprintSha256: text("pinned_fingerprint_sha256"),
    clientCertificatePem: text("client_certificate_pem"),
    clientKeyEncrypted: text("client_key_encrypted"),
    /** Incremented on every rotation; part of the HTTP agent cache key. */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("server_credentials_active_unique").on(t.serverId).where(sql`${t.revokedAt} is null`)],
);

// ---------------------------------------------------------------------------
// Protocols
// ---------------------------------------------------------------------------

export const protocols = pgTable(
  "protocols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** lucide-react icon name. */
    icon: text("icon").notNull().default("shield"),
    category: text("category").notNull().default("vpn"),
    /** Which ProtocolAdapter handles provisioning (see src/server/provisioning/adapters). */
    adapterKey: text("adapter_key").notNull(),
    /** Identifiers a node may report for this protocol (case-insensitive, `_`/`-` agnostic). */
    nodeIdentifiers: text("node_identifiers").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    /** Seeded protocols: slug and adapter are locked. */
    isSystem: boolean("is_system").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    durationOptions: integer("duration_options").array().notNull().default(sql`'{3,7,14,30}'::integer[]`),
    defaultDurationDays: integer("default_duration_days").notNull().default(7),
    outputFields: jsonb("output_fields").$type<OutputFieldDefinition[]>().notNull().default([]),
    /** Public rate limit: accounts per client IP per day for this protocol. */
    maxAccountsPerIpPerDay: integer("max_accounts_per_ip_per_day").notNull().default(3),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("protocols_slug_unique").on(t.slug),
    index("protocols_enabled_order_idx").on(t.enabled, t.displayOrder),
    check("protocols_slug_format", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,47}$'`),
  ],
);

export const protocolFields = pgTable(
  "protocol_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: protocolFieldType("type").notNull().default("text"),
    required: boolean("required").notNull().default(true),
    placeholder: text("placeholder"),
    helpText: text("help_text"),
    options: jsonb("options").$type<FieldOption[]>().notNull().default([]),
    validation: jsonb("validation").$type<FieldValidation>().notNull().default({}),
    defaultValue: text("default_value"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("protocol_fields_protocol_key_unique").on(t.protocolId, t.key),
    check("protocol_fields_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{0,31}$'`),
  ],
);

export const serverProtocols = pgTable(
  "server_protocols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    /** Admin switch. */
    enabled: boolean("enabled").notNull().default(false),
    /** The node reported this protocol as installed at the last sync. */
    detected: boolean("detected").notNull().default(false),
    /** running | stopped | unknown, as reported by the node. */
    serviceStatus: text("service_status").notNull().default("unknown"),
    /** Identifier the node used for this protocol. */
    nodeIdentifier: text("node_identifier"),
    port: integer("port"),
    ports: jsonb("ports").$type<PortMap>().notNull().default({}),
    transports: text("transports").array().notNull().default(sql`'{}'::text[]`),
    /** Per-protocol cap on this server; null = only the server-wide cap applies. */
    maxAccounts: integer("max_accounts"),
    currentAccounts: integer("current_accounts").notNull().default(0),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("server_protocols_server_protocol_unique").on(t.serverId, t.protocolId),
    index("server_protocols_publish_idx").on(t.protocolId, t.enabled, t.detected),
    check("server_protocols_current_non_negative", sql`${t.currentAccounts} >= 0`),
    check("server_protocols_max_positive", sql`${t.maxAccounts} is null or ${t.maxAccounts} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Accounts & provisioning
// ---------------------------------------------------------------------------

export const vpnAccounts = pgTable(
  "vpn_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "restrict" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "restrict" }),
    /** Account identifier on the node; null until the node confirms creation. */
    remoteAccountId: text("remote_account_id"),
    username: text("username"),
    status: accountStatus("status").notNull().default("pending"),
    durationDays: integer("duration_days").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => admins.id, { onDelete: "set null" }),
    /** Safe (non-secret) connection metadata: host, ports, transport, SNI, path... */
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    /** HMAC of the requesting client IP (abuse investigation without storing raw IPs). */
    clientIpHash: text("client_ip_hash"),
    /** True while this account occupies a capacity slot on its server/protocol. */
    holdsCapacity: boolean("holds_capacity").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("vpn_accounts_server_status_idx").on(t.serverId, t.status),
    index("vpn_accounts_protocol_status_idx").on(t.protocolId, t.status),
    index("vpn_accounts_expires_idx").on(t.expiresAt).where(sql`${t.status} = 'active'`),
    index("vpn_accounts_username_idx").on(t.username),
    index("vpn_accounts_created_idx").on(t.createdAt),
    index("vpn_accounts_remote_idx").on(t.serverId, t.remoteAccountId),
  ],
);

export const provisioningRequests = pgTable(
  "provisioning_requests",
  {
    /** Sent to the node as the request id / Idempotency-Key. */
    id: uuid("id").primaryKey().defaultRandom(),
    /** Client-supplied (namespaced) idempotency key; a double-click maps to the same row. */
    idempotencyKey: text("idempotency_key").notNull(),
    operation: provisioningOperation("operation").notNull(),
    state: provisioningState("state").notNull().default("queued"),
    accountId: uuid("account_id").references(() => vpnAccounts.id, { onDelete: "set null" }),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "restrict" }),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => protocols.id, { onDelete: "restrict" }),
    attempts: integer("attempts").notNull().default(0),
    /** SHA-256 of the normalised request; reusing a key with a different payload is rejected. */
    inputDigest: text("input_digest").notNull(),
    /** Encrypted user input (may contain a password). Cleared when the request reaches a final state. */
    inputEncrypted: text("input_encrypted"),
    /** SHA-256 of the claim token that lets the requester fetch the result. */
    claimTokenHash: text("claim_token_hash"),
    /**
     * Encrypted presented result (may contain passwords/keys/config files), kept only for
     * PROVISION_RESULT_TTL_SECONDS so the requester can retrieve it, then erased by the sweeper.
     */
    resultEncrypted: text("result_encrypted"),
    resultExpiresAt: timestamp("result_expires_at", { withTimezone: true }),
    clientIpHash: text("client_ip_hash"),
    requestedByAdminId: uuid("requested_by_admin_id").references(() => admins.id, { onDelete: "set null" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provisioning_requests_idempotency_unique").on(t.idempotencyKey),
    index("provisioning_requests_state_idx").on(t.state, t.updatedAt),
    index("provisioning_requests_account_idx").on(t.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export const serverHealth = pgTable(
  "server_health",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    reachable: boolean("reachable").notNull(),
    status: serverHealthStatus("status").notNull(),
    latencyMs: integer("latency_ms"),
    cpuPercent: real("cpu_percent"),
    memoryUsedBytes: bigint("memory_used_bytes", { mode: "number" }),
    memoryTotalBytes: bigint("memory_total_bytes", { mode: "number" }),
    diskUsedBytes: bigint("disk_used_bytes", { mode: "number" }),
    diskTotalBytes: bigint("disk_total_bytes", { mode: "number" }),
    load1: real("load_1"),
    load5: real("load_5"),
    load15: real("load_15"),
    uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
    services: jsonb("services").$type<Record<string, string>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (t) => [index("server_health_server_checked_idx").on(t.serverId, t.checkedAt.desc())],
);

export const serverStatistics = pgTable(
  "server_statistics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    accountsTotal: integer("accounts_total"),
    accountsByProtocol: jsonb("accounts_by_protocol").$type<Record<string, number>>().notNull().default({}),
    onlineUsers: integer("online_users"),
    bandwidthRxBytes: bigint("bandwidth_rx_bytes", { mode: "number" }),
    bandwidthTxBytes: bigint("bandwidth_tx_bytes", { mode: "number" }),
  },
  (t) => [index("server_statistics_server_captured_idx").on(t.serverId, t.capturedAt.desc())],
);

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export const provisioningLogs = pgTable(
  "provisioning_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** e.g. server.added, server.synced, server.connection_failed, account.created, account.failed */
    event: text("event").notNull(),
    level: logLevel("level").notNull().default("info"),
    /** success | failure | info */
    status: text("status").notNull().default("info"),
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
    protocolId: uuid("protocol_id").references(() => protocols.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => vpnAccounts.id, { onDelete: "set null" }),
    requestId: uuid("request_id"),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    /** Safe message. Never contains passwords, keys, tokens or configs. */
    message: text("message").notNull(),
    details: jsonb("details").$type<JsonObject>().notNull().default({}),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("provisioning_logs_created_idx").on(t.createdAt.desc()),
    index("provisioning_logs_server_idx").on(t.serverId, t.createdAt.desc()),
    index("provisioning_logs_event_idx").on(t.event),
    index("provisioning_logs_level_idx").on(t.level, t.createdAt.desc()),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    /** Snapshot so the trail survives admin deletion. */
    adminEmail: text("admin_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    success: boolean("success").notNull().default(true),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: jsonb("details").$type<JsonObject>().notNull().default({}),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt.desc()),
    index("audit_logs_admin_idx").on(t.adminId, t.createdAt.desc()),
    index("audit_logs_action_idx").on(t.action),
  ],
);

export type Admin = typeof admins.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type ServerCredential = typeof serverCredentials.$inferSelect;
export type Protocol = typeof protocols.$inferSelect;
export type ProtocolField = typeof protocolFields.$inferSelect;
export type ServerProtocol = typeof serverProtocols.$inferSelect;
export type VpnAccount = typeof vpnAccounts.$inferSelect;
export type ProvisioningRequest = typeof provisioningRequests.$inferSelect;
export type ServerHealthRow = typeof serverHealth.$inferSelect;
export type ProvisioningLog = typeof provisioningLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
