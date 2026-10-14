/**
 * Clipboard and file helpers for the result view. Everything stays in the browser: files are
 * built from Blobs (no server round trip) and nothing is logged.
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path (e.g. permissions policy)
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Safe file name: letters, digits, dot, dash and underscore only. */
export function safeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(content: string, filename: string, mimeType = "text/plain") {
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : "application/octet-stream";
  downloadBlob(new Blob([content], { type: type.startsWith("text/") ? `${type};charset=utf-8` : type }), filename);
}

/** data:image/png;base64,... → Blob (fetch() on data: URLs is blocked by our CSP). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64 = ""] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+);base64$/.exec(head ?? "")?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
