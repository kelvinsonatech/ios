/**
 * Structured data for search engines. The JSON is escaped so values (admin-entered names,
 * descriptions) can never close the <script> element. Pass the CSP nonce from headers().
 */
export function JsonLd({ data, nonce }: { data: object; nonce?: string }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />;
}
