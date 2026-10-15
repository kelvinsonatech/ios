import { BrandMark } from "@/components/brand";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { Flag } from "./flag";

export interface HeroArtServer {
  key: string;
  name: string;
  protocol: string;
  countryCode: string;
  latencyMs: number | null;
  remaining: number | null;
}

/**
 * Home hero illustration (original artwork): a globe of orbits with the brand shield in the middle,
 * live server chips (real data from the status page) and an example account profile card with a
 * DiceBear avatar. Purely decorative for assistive technology: the same facts are on the page.
 */
export function HeroArt({ avatar, servers, sample }: { avatar: string; servers: HeroArtServer[]; sample: { protocol: string; server: string; countryCode: string; days: number } }) {
  const chips = servers.slice(0, 2);
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[30rem] select-none">
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full text-white">
        <defs>
          <radialGradient id="ha-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.28" />
            <stop offset="70%" stopColor="white" stopOpacity="0.05" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="190" fill="url(#ha-core)" />
        <g fill="none" stroke="currentColor" strokeOpacity="0.22">
          <circle cx="200" cy="200" r="150" />
          <circle cx="200" cy="200" r="110" strokeDasharray="2 6" />
          <ellipse cx="200" cy="200" rx="150" ry="58" />
          <ellipse cx="200" cy="200" rx="58" ry="150" />
          <ellipse cx="200" cy="200" rx="150" ry="58" transform="rotate(60 200 200)" />
          <ellipse cx="200" cy="200" rx="150" ry="58" transform="rotate(-60 200 200)" />
        </g>
        <g fill="currentColor">
          {[
            [86, 150],
            [312, 128],
            [290, 290],
            [128, 300],
            [200, 50],
            [350, 210],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fillOpacity="0.18" className="origin-center animate-glow" style={{ animationDelay: `${i * 0.6}s` }} />
              <circle cx={x} cy={y} r="3.5" />
            </g>
          ))}
        </g>
        <g fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="3 5">
          <path d="M86 150Q200 90 312 128" />
          <path d="M128 300Q210 250 290 290" />
          <path d="M200 50Q260 140 350 210" />
        </g>
      </svg>

      <div className="absolute top-[40%] left-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2.2rem] bg-white/15 shadow-2xl ring-1 shadow-black/20 ring-white/30 backdrop-blur-md sm:size-36">
        <BrandMark className="size-20 drop-shadow-lg sm:size-24" />
      </div>

      {chips.map((s, i) => (
        <div
          key={s.key}
          className={cn(
            "absolute flex items-center gap-2.5 rounded-2xl bg-card/95 px-3 py-2 text-card-foreground shadow-xl ring-1 shadow-black/15 ring-black/5 backdrop-blur",
            i === 0 ? "top-[4%] right-0 animate-float-slow" : "top-[58%] -left-2 animate-float [animation-delay:1.5s]",
          )}
        >
          <Flag code={s.countryCode} squared className="size-8 rounded-full" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="text-[11px] text-muted-foreground">{s.protocol}</p>
          </div>
          <div className="ml-1 text-right leading-tight">
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {s.latencyMs !== null ? `${s.latencyMs} ms` : "Online"}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">{s.remaining === null ? "Open" : `${s.remaining} left`}</p>
          </div>
        </div>
      ))}

      <div className="absolute right-0 -bottom-[2%] w-60 animate-float rounded-3xl bg-card/95 p-4 text-card-foreground shadow-2xl ring-1 shadow-black/20 ring-black/5 backdrop-blur sm:w-64">
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            <UserAvatar src={avatar} size={48} className="ring-2 ring-primary/30" />
            <span className="absolute right-0 bottom-0 size-3 rounded-full bg-success ring-2 ring-card" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">traveller</p>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Flag code={sample.countryCode} className="h-2.5 w-3.5" />
              <span className="truncate">
                {sample.protocol} · {sample.server}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {["Host", "Password"].map((label, i) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-medium">{i === 0 ? "••••.••••.net" : "••••••••••"}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Expires in {sample.days} days</span>
            <span>Example card</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[85%] rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
