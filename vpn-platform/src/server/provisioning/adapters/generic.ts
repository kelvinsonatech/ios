import type { Artifact, ProtocolAdapter } from "../types";
import { AdapterResponseError, ConfigReader, fileArtifact, requireRemoteId, resolveExpiry, ValuesBuilder } from "./base";
import { linuxUsernameGuard, optionGuard, passwordGuard } from "./guards";

/**
 * Generic adapter for future protocols ("Protocol X") whose output is plain key/value data.
 * Output fields are fully defined in the admin panel: each field's `path` points into the node's
 * `config` object, e.g. "ports.tcp" or "link". Kind "uri"/"file" fields become artifacts.
 * No code change is required to add such a protocol.
 */
export const genericAdapter: ProtocolAdapter = {
  key: "generic",
  label: "Generic (configurable)",
  description: "For new protocols: sends declared fields to the node and maps output via admin-defined paths.",
  inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
  requiredInputs: [],
  supportsRenew: false,
  outputFields: [],
  defaultFields: [{ key: "duration", label: "Duration", type: "duration", required: true, options: [], validation: {} }],

  buildSpec(input, ctx) {
    const options: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.options)) options[k] = optionGuard.parse(v);
    return {
      protocol: ctx.serverProtocol.nodeIdentifier ?? ctx.protocol.slug,
      username: input.username,
      password: input.password,
      durationDays: input.durationDays,
      options,
    };
  },

  parseAccount(account, ctx, input) {
    const cfg = new ConfigReader(account.config);
    const v = new ValuesBuilder();
    const artifacts: Artifact[] = [];
    for (const f of ctx.protocol.outputFields) {
      const path = f.path ?? f.key;
      if (f.kind === "file" || f.kind === "multiline") {
        const text = cfg.text(path, 65_536);
        if (!text) continue;
        if (f.kind === "file") {
          artifacts.push(
            fileArtifact({
              key: f.key,
              label: f.label,
              content: text,
              filename: (f.filename ?? `${f.key}.txt`).replace("{username}", account.username ?? input.username ?? "account"),
              mimeType: "text/plain",
              qr: !!f.qr,
              sensitive: f.sensitive,
            }),
          );
        } else v.set(f.key, text, f.sensitive);
      } else if (f.kind === "uri") {
        const uri = cfg.str(path, 4096);
        if (uri && /^[a-z][a-z0-9+.-]{1,20}:\/\//i.test(uri) && !/^(javascript|data|vbscript):/i.test(uri)) {
          artifacts.push({ key: f.key, label: f.label, kind: "uri", content: uri, qr: f.qr ?? true, sensitive: f.sensitive });
        }
      } else {
        const raw = cfg.get(path);
        const value = Array.isArray(raw) ? raw.filter((x) => typeof x === "number" || typeof x === "string").join(", ") : cfg.str(path, 1024);
        v.set(f.key, value, f.sensitive);
      }
    }
    if (Object.keys(v.values).length === 0 && artifacts.length === 0) {
      throw new AdapterResponseError("None of the configured output fields were present in the server's response.");
    }
    return {
      remoteAccountId: requireRemoteId(account),
      username: account.username ?? input.username,
      expiresAt: resolveExpiry(account, input),
      values: v.values,
      artifacts,
    };
  },
};
