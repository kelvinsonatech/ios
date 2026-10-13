/**
 * Test environment. Integration tests need PostgreSQL and Redis:
 *   TEST_DATABASE_URL (default postgres://vaultline:vaultline@localhost:5432/vaultline_test)
 *   TEST_REDIS_URL    (default redis://localhost:6379/15)
 * The test database is wiped and re-migrated by the integration suites.
 */
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://vaultline:vaultline@localhost:5432/vaultline_test",
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
  APP_ENCRYPTION_KEYS: `old:${Buffer.alloc(32, 7).toString("base64")},k1:${Buffer.alloc(32, 1).toString("base64")}`,
  APP_ENCRYPTION_ACTIVE_KEY: "k1",
  IP_HASH_SECRET: "test-ip-hash-secret-0123456789abcdef",
  ALLOW_INSECURE_NODE_HTTP: "true",
  ALLOW_PRIVATE_NODE_ADDRESSES: "true",
  NODE_CONNECT_TIMEOUT_MS: "1000",
  NODE_REQUEST_TIMEOUT_MS: "2000",
  NODE_PROVISION_TIMEOUT_MS: "1500",
  NODE_AGENT_LATEST_VERSION: "1.0.0",
  PROVISION_MAX_ATTEMPTS: "3",
  LOGIN_MAX_FAILURES: "3",
};
const env = process.env as Record<string, string | undefined>;
for (const [k, v] of Object.entries(defaults)) {
  // Tests must never run against the development or production database by accident.
  if (k === "DATABASE_URL" || k === "REDIS_URL" || k === "NODE_ENV") env[k] = v;
  else env[k] ??= v;
}
