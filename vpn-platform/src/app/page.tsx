import { connection } from "next/server";
import { GlobeIcon, LockKeyholeIcon, ServerIcon, ZapIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ProtocolIcon } from "@/components/protocol-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { siteConfig } from "@/lib/site";
import { listPublicProtocols } from "@/server/protocols/catalog";

/**
 * Placeholder landing page. The full public site (protocol pages, server cards, account creation)
 * is roadmap phases 14–17; everything shown here already comes from the database.
 */
export default async function HomePage() {
  await connection();
  let protocols: Awaited<ReturnType<typeof listPublicProtocols>> = [];
  try {
    protocols = await listPublicProtocols();
  } catch {
    protocols = [];
  }
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border bg-card px-6 py-16 sm:px-12 sm:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 right-0 h-80 w-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
          />
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Launching soon
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{siteConfig.tagline}</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            SSH, V2Ray, WireGuard and OpenVPN accounts on servers around the world — generated instantly, delivered once, never stored.
          </p>
          <div className="mt-10 grid max-w-2xl gap-4 text-sm sm:grid-cols-3">
            {[
              { icon: <ZapIcon />, t: "Instant", d: "Accounts are created on the server in seconds." },
              { icon: <LockKeyholeIcon />, t: "Private", d: "Credentials are shown once and not kept." },
              { icon: <GlobeIcon />, t: "Global", d: "Pick the location closest to you." },
            ].map((f) => (
              <div key={f.t} className="flex gap-3">
                <span className="mt-0.5 text-primary [&_svg]:size-4">{f.icon}</span>
                <span>
                  <span className="block font-medium">{f.t}</span>
                  <span className="text-muted-foreground">{f.d}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-lg font-semibold">Protocols</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {protocols.map((p) => (
              <div key={p.slug} className="flex items-start gap-3 rounded-xl border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <ProtocolIcon name={p.icon} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{p.name}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{p.description}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ServerIcon className="size-3" /> {p.serverCount} server{p.serverCount === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            ))}
            {protocols.length === 0 ? <p className="text-sm text-muted-foreground">No protocols available yet.</p> : null}
          </div>
        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {siteConfig.name}
      </footer>
    </div>
  );
}
