import { CircleCheckIcon, ExternalLinkIcon, LightbulbIcon, MonitorSmartphoneIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PLATFORMS, type ProtocolGuide } from "@/lib/protocol-guides";
import { cn } from "@/lib/utils";

/**
 * "How to connect" for one protocol: numbered setup steps, recommended apps per platform (tabs,
 * official links only) and practical tips. Used on /<protocol>#guide.
 */
export function GuideSection({ guide, protocolName, className }: { guide: ProtocolGuide; protocolName: string; className?: string }) {
  const platforms = PLATFORMS.filter((p) => (guide.apps[p.key]?.length ?? 0) > 0);
  return (
    <div className={cn("grid gap-6 lg:grid-cols-5", className)}>
      <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-7 lg:col-span-3">
        <h3 className="text-lg font-semibold tracking-tight">Set up {protocolName} in a minute</h3>
        <p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p>
        <ol className="mt-6 space-y-4">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 tabular-nums">
                {i + 1}
              </span>
              <span className="pt-1 text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>
        {guide.tips.length > 0 ? (
          <div className="mt-7 rounded-2xl bg-warning-soft/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LightbulbIcon className="size-4 text-warning-strong" aria-hidden />
              Tips
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {guide.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-warning" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-7 lg:col-span-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MonitorSmartphoneIcon className="size-5 text-primary" aria-hidden />
          Recommended apps
        </h3>
        {platforms.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Any client that supports {protocolName} will work. Your account card lists every value you need.</p>
        ) : (
          <Tabs defaultValue={platforms[0]!.key} className="mt-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/70 p-1">
              {platforms.map((p) => (
                <TabsTrigger key={p.key} value={p.key} className="h-9 flex-none px-3">
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {platforms.map((p) => (
              <TabsContent key={p.key} value={p.key} className="mt-1">
                <ul className="space-y-2">
                  {guide.apps[p.key]!.map((app) => (
                    <li key={app.name}>
                      {app.url ? (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{app.name}</span>
                            {app.note ? <span className="block font-mono text-xs text-muted-foreground">{app.note}</span> : null}
                          </span>
                          <ExternalLinkIcon className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-dashed px-4 py-2.5">
                          <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{app.name}</span>
                            <span className="block font-mono text-xs text-muted-foreground">{app.note ?? "Find it in your app store"}</span>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </TabsContent>
            ))}
          </Tabs>
        )}
        <p className="mt-5 text-xs text-muted-foreground">We are not affiliated with these apps. Download them only from the official pages or stores.</p>
      </div>
    </div>
  );
}
