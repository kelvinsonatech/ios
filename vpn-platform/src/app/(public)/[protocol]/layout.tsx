import { notFound } from "next/navigation";
import { loadProtocolPage } from "@/app/(public)/_lib/data";

/**
 * Validates the protocol slug before anything streams. This layout sits outside the segment's
 * loading.tsx boundary, so an unknown slug (/wp-login.php, /contact-us ...) is answered with a real
 * 404 status instead of a 200 that only shows the not-found UI. loadProtocolPage() is cached per
 * request, so the page below reuses the same result.
 */
export default async function ProtocolLayout({ children, params }: { children: React.ReactNode; params: Promise<{ protocol: string }> }) {
  const { protocol } = await params;
  if (!(await loadProtocolPage(protocol))) notFound();
  return children;
}
