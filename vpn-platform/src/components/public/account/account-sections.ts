import type { PublicAccountResult } from "@/lib/public/types";

/**
 * Normalises the one-time account result (fields + artifacts) into display items, groups them
 * for the result view and builds the plain-text export used by "Copy all" and "Download .txt".
 */
export type ItemKind = "text" | "secret" | "uri" | "multiline" | "file";

export interface ResultItem {
  id: string;
  label: string;
  kind: ItemKind;
  value: string;
  sensitive: boolean;
  copyable: boolean;
  qr: boolean;
  filename?: string;
  mimeType?: string;
}

export type GroupKey = "connection" | "credentials" | "links" | "config" | "files";

export const GROUP_TITLES: Record<GroupKey, { title: string; description: string }> = {
  credentials: { title: "Credentials", description: "Your login. Hidden values can be revealed or copied." },
  connection: { title: "Connection", description: "Server address and ports for your app." },
  links: { title: "Share links", description: "Import into your app with a tap, or scan the QR code." },
  config: { title: "Payload & config", description: "Paste these into your tunnelling app." },
  files: { title: "Files", description: "Configuration files for your client." },
};

const GROUP_ORDER: GroupKey[] = ["credentials", "connection", "links", "config", "files"];
const CREDENTIAL_KEYS = new Set(["username", "user", "password", "uuid", "auth", "remark", "id"]);

function groupOf(item: ResultItem): GroupKey {
  if (item.kind === "file") return "files";
  if (item.kind === "uri") return "links";
  if (item.kind === "multiline") return item.sensitive ? "credentials" : "config";
  if (item.kind === "secret" || item.sensitive || CREDENTIAL_KEYS.has(item.id.replace(/^field:/, ""))) return "credentials";
  return "connection";
}

export function resultItems(account: PublicAccountResult): ResultItem[] {
  const items: ResultItem[] = account.fields
    .filter((f) => typeof f.value === "string" && f.value !== "")
    .map((f) => ({
      id: `field:${f.key}`,
      label: f.label,
      kind: f.kind,
      value: f.value,
      sensitive: f.sensitive,
      copyable: f.copyable,
      qr: f.qr,
    }));
  for (const a of account.artifacts) {
    if (typeof a.content !== "string" || a.content === "") continue;
    items.push({
      id: `artifact:${a.key}`,
      label: a.label,
      kind: a.kind,
      value: a.content,
      sensitive: a.sensitive,
      copyable: true,
      qr: a.qr,
      filename: a.filename,
      mimeType: a.mimeType,
    });
  }
  return items;
}

export function groupItems(items: ResultItem[]): { key: GroupKey; items: ResultItem[] }[] {
  const map = new Map<GroupKey, ResultItem[]>();
  for (const it of items) {
    const g = groupOf(it);
    map.set(g, [...(map.get(g) ?? []), it]);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ key: g, items: map.get(g)! }));
}

/** Plain-text summary of the whole account. Files are included in full only when `withFiles`. */
export function accountText(
  account: PublicAccountResult,
  opts: { siteName: string; expiresLabel: string; withFiles: boolean },
): string {
  const items = resultItems(account);
  const lines: string[] = [
    `${opts.siteName} · ${account.protocol.name} account`,
    "=".repeat(40),
    `Server:   ${account.server.name}`,
    ...(account.username ? [`Username: ${account.username}`] : []),
    `Expires:  ${opts.expiresLabel} (${account.expiresAt})`,
    "",
  ];
  for (const group of groupItems(items)) {
    lines.push(`[${GROUP_TITLES[group.key].title}]`);
    for (const it of group.items) {
      if (it.kind === "file") {
        if (opts.withFiles) {
          lines.push(`----- ${it.filename ?? it.label} -----`, it.value.replace(/\s+$/, ""), `----- end of ${it.filename ?? it.label} -----`);
        } else {
          lines.push(`${it.label}: file ${it.filename ?? ""} (download it from the page)`.trim());
        }
      } else if (it.kind === "multiline" || it.kind === "uri") {
        lines.push(`${it.label}:`, it.value);
      } else {
        lines.push(`${it.label}: ${it.value}`);
      }
    }
    lines.push("");
  }
  lines.push("Keep this private: anyone with these details can use your account.");
  return lines.join("\n");
}
