/**
 * Serve a DiceBear avatar (generated locally by src/server/avatar.ts) as a same-origin SVG image.
 * Admin lists use these URLs instead of inline data URIs so a page of 50 accounts does not carry
 * up to 1 MB of SVG twice (HTML + RSC payload). The SVG gets its own locked-down CSP.
 */
export function svgAvatarResponse(dataUri: string, maxAgeSeconds = 86_400): Response {
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(",") + 1));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": `private, max-age=${maxAgeSeconds}`,
    },
  });
}
