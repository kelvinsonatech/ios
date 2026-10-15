import { notFound } from "next/navigation";
import { loadCountryPage } from "@/app/(public)/_lib/data";

/**
 * Validates the country slug before anything streams (see [protocol]/layout.tsx). The country
 * page and its loading.tsx live in the (servers) route group, so this layout runs outside any
 * Suspense boundary and /ssh/atlantis gets a real 404 status. A country whose servers are all
 * offline still resolves (empty state), so its server pages below stay reachable; their own layout
 * validates the server slug.
 */
export default async function CountryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ protocol: string; country: string }> }) {
  const { protocol, country } = await params;
  if (!(await loadCountryPage(protocol, country))) notFound();
  return children;
}
