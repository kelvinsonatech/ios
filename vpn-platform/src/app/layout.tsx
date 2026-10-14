import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteOrigin } from "@/lib/seo";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import { getSiteSettings } from "@/server/settings/service";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_SITE_SETTINGS.siteName;
  let description = DEFAULT_SITE_SETTINGS.seoDescription;
  try {
    const s = await getSiteSettings();
    name = s.siteName;
    description = s.seoDescription || description;
  } catch {
    // Settings unavailable (e.g. no database yet): the defaults are fine for metadata.
  }
  return {
    metadataBase: new URL(siteOrigin()),
    title: { default: name, template: `%s · ${name}` },
    description,
    applicationName: name,
    openGraph: { siteName: name, type: "website", locale: "en_US" },
    twitter: { card: "summary" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#12151c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
