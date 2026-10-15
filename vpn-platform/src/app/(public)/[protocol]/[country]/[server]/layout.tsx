import { notFound } from "next/navigation";
import { loadServerPage } from "@/app/(public)/_lib/data";

/**
 * Validates the server slug outside this segment's loading.tsx boundary, so a wrong server URL
 * (/ssh/germany/zz9) answers with a real 404 status. The page reuses the request-cached lookup.
 */
export default async function ServerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ protocol: string; country: string; server: string }> }) {
  const { protocol, country, server } = await params;
  if (!(await loadServerPage(protocol, country, server))) notFound();
  return children;
}
