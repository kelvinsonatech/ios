import { redactObject } from "./redact";

type Level = "debug" | "info" | "warn" | "error";

/** Minimal structured logger (JSON lines). Context objects are always redacted. */
function write(level: Level, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...redactObject(context) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level !== "debug" || process.env.LOG_DEBUG === "true") console.log(line);
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => write("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => write("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => write("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => write("error", m, c),
};

export function errorSummary(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.name, message: e.message.slice(0, 300), code: (e as { code?: unknown }).code };
  return { error: String(e).slice(0, 300) };
}
