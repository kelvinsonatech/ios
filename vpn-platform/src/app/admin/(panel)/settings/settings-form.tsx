"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  GaugeIcon,
  GlobeIcon,
  InfoIcon,
  LoaderCircleIcon,
  MailIcon,
  MegaphoneIcon,
  PaletteIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/admin/form-field";
import { TimeZonePicker, type TimeZoneOption } from "@/components/admin/timezone-picker";
import type { AvatarStyle } from "@/lib/avatar-styles";
import type { SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import { saveSettingsAction } from "./actions";
import { formatCountdown, minutesOfDay, resetSchedule } from "./schedule";

// ---------------------------------------------------------------------------
// Draft state: strings for inputs, converted to the stored shape on save
// ---------------------------------------------------------------------------

type Tone = SiteSettings["announcement"]["tone"];
type Row = { id: string; value: string };

interface Draft {
  siteName: string;
  tagline: string;
  seoDescription: string;
  announcement: { enabled: boolean; text: string; tone: Tone; linkLabel: string; linkUrl: string };
  quota: { resetTimes: Row[]; timezone: string; defaultLimit: string };
  health: { intervalSeconds: string; failureThreshold: string };
  avatarStyle: AvatarStyle;
  contact: { email: string; telegramUrl: string };
  rules: Row[];
  display: SiteSettings["display"];
}

let rowSeq = 0;
const newRow = (value = ""): Row => ({ id: `n${++rowSeq}`, value });

function toDraft(s: SiteSettings): Draft {
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    seoDescription: s.seoDescription,
    announcement: {
      enabled: s.announcement.enabled,
      text: s.announcement.text,
      tone: s.announcement.tone,
      linkLabel: s.announcement.linkLabel ?? "",
      linkUrl: s.announcement.linkUrl ?? "",
    },
    quota: {
      resetTimes: s.quota.resetTimes.map((value, i) => ({ id: `t${i}`, value })),
      timezone: s.quota.timezone,
      defaultLimit: s.quota.defaultLimit == null ? "" : String(s.quota.defaultLimit),
    },
    health: { intervalSeconds: String(s.health.intervalSeconds), failureThreshold: String(s.health.failureThreshold) },
    avatarStyle: s.avatarStyle,
    contact: { email: s.contact.email ?? "", telegramUrl: s.contact.telegramUrl ?? "" },
    rules: s.rules.map((value, i) => ({ id: `r${i}`, value })),
    display: { ...s.display },
  };
}

/** Whole numbers become numbers; anything else is sent as typed so the server reports the field. */
function int(v: string): number | string {
  const t = v.trim();
  return /^\d{1,9}$/.test(t) ? Number(t) : t;
}

function toPayload(d: Draft) {
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  return {
    siteName: d.siteName,
    tagline: d.tagline,
    seoDescription: d.seoDescription,
    announcement: {
      enabled: d.announcement.enabled,
      text: d.announcement.text,
      tone: d.announcement.tone,
      linkLabel: orNull(d.announcement.linkLabel),
      linkUrl: orNull(d.announcement.linkUrl),
    },
    quota: {
      resetTimes: d.quota.resetTimes.map((r) => r.value),
      timezone: d.quota.timezone,
      defaultLimit: d.quota.defaultLimit.trim() ? int(d.quota.defaultLimit) : null,
    },
    health: { intervalSeconds: int(d.health.intervalSeconds), failureThreshold: int(d.health.failureThreshold) },
    avatarStyle: d.avatarStyle,
    contact: { email: orNull(d.contact.email), telegramUrl: orNull(d.contact.telegramUrl) },
    rules: d.rules.map((r) => r.value),
    display: { showHostnames: d.display.showHostnames, showStats: d.display.showStats },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Current time, refreshed every 30 s on the client; null during SSR so markup hydrates cleanly. */
function useNow(stepMs = 30_000): number | null {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, stepMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => null,
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return <span className={cn("tabular-nums", n > max && "text-destructive")}>{`${n}/${max}`}</span>;
}

function humanSeconds(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${s} s`;
  if (s % 3600 === 0) return `${s / 3600} h`;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

const SECTIONS = [
  { id: "general", label: "General", icon: GlobeIcon },
  { id: "announcement", label: "Announcement bar", icon: MegaphoneIcon },
  { id: "display", label: "Public display", icon: EyeIcon },
  { id: "quotas", label: "Quotas & resets", icon: ClockIcon },
  { id: "health", label: "Health monitor", icon: GaugeIcon },
  { id: "avatars", label: "Avatars", icon: PaletteIcon },
  { id: "contact", label: "Contact", icon: MailIcon },
  { id: "rules", label: "Account rules", icon: ScrollTextIcon },
] as const;

const TONES: { value: Tone; label: string; icon: React.ComponentType<{ className?: string }>; bar: string }[] = [
  { value: "info", label: "Info", icon: InfoIcon, bar: "border-info/30 bg-info-soft text-info" },
  { value: "success", label: "Good news", icon: CheckCircle2Icon, bar: "border-success/30 bg-success-soft text-success" },
  { value: "warning", label: "Warning", icon: TriangleAlertIcon, bar: "border-warning/30 bg-warning-soft text-warning" },
];

const RESET_PRESETS: { label: string; times: string[] }[] = [
  { label: "Daily", times: ["00:00"] },
  { label: "Every 12 h", times: ["00:00", "12:00"] },
  { label: "Every 8 h", times: ["00:00", "08:00", "16:00"] },
  { label: "Every 6 h", times: ["00:00", "06:00", "12:00", "18:00"] },
];

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  aside,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className={aside ? "grid-cols-[1fr_auto]" : undefined}>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
        <CardDescription className="col-start-1">{description}</CardDescription>
        {aside ? <div className="col-start-2 row-span-2 row-start-1 self-start">{aside}</div> : null}
      </CardHeader>
      <CardContent className="grid gap-5">{children}</CardContent>
    </Card>
  );
}

/** A labelled switch with an explanation and a small preview of what visitors see. */
function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
  example,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  example: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-muted/20 p-4">
      <div className="grid min-w-0 flex-1 gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Visitors see:</span>
          <span className={cn("rounded-sm px-1.5 py-px font-mono", checked ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
            {example}
          </span>
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface AvatarStyleOption {
  key: AvatarStyle;
  label: string;
  license: string;
  /** Same-origin preview image URLs (one per sample seed). */
  previews: string[];
}

export function SettingsForm({
  initial,
  zones,
  styles,
  siteHost,
}: {
  initial: SiteSettings;
  zones: TimeZoneOption[];
  styles: AvatarStyleOption[];
  /** Host of the public site for the search preview, e.g. "vpn.example.com". */
  siteHost: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const formRef = useRef<HTMLFormElement>(null);
  const now = useNow();

  const dirty = useMemo(() => JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(toDraft(saved))), [draft, saved]);

  /** Update one part of the draft and clear the errors of the fields it touches. */
  const patch = useCallback((fn: (d: Draft) => Draft, clear: string[] = []) => {
    setDraft((d) => fn(d));
    if (clear.length) {
      setErrors((e) => {
        const next = { ...e };
        for (const k of Object.keys(next)) if (clear.some((c) => k === c || k.startsWith(`${c}.`))) delete next[k];
        return next;
      });
    }
  }, []);

  const err = (k: string) => errors[k];

  const save = useCallback(() => {
    start(async () => {
      const r = await saveSettingsAction(JSON.stringify(toPayload(draft)));
      if (r.error) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      const next = (r.data?.settings as SiteSettings | undefined) ?? saved;
      setSaved(next);
      setDraft(toDraft(next));
      setErrors({});
      toast.success(r.message ?? "Settings saved.");
    });
  }, [draft, saved]);

  // Ctrl/Cmd+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !pending) save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, pending, save]);

  // Highlight the section in view in the side navigation.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const a = draft.announcement;
  const tone = TONES.find((t) => t.value === a.tone) ?? TONES[0]!;
  const schedule = now === null ? null : resetSchedule(draft.quota.resetTimes.map((r) => r.value), draft.quota.timezone, now);
  const nowMinutes = now === null ? null : minutesOfDay(now, draft.quota.timezone);
  const interval = Number(draft.health.intervalSeconds);
  const threshold = Number(draft.health.failureThreshold);
  const sortedTimes = [...new Set(draft.quota.resetTimes.map((r) => r.value).filter((v) => /^\d{2}:\d{2}$/.test(v)))].sort();

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8"
    >
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="sticky top-20 grid gap-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const hasError = Object.keys(errors).some((k) => sectionOf(k) === s.id);
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={activeSection === s.id ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    activeSection === s.id && "bg-muted font-medium text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", activeSection === s.id && "text-primary")} />
                  {s.label}
                  {hasError ? <span className="ml-auto size-1.5 rounded-full bg-destructive" aria-label="has errors" /> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid min-w-0 gap-6">
        {/* General ------------------------------------------------------------------ */}
        <Section id="general" icon={GlobeIcon} title="General" description="How the website names and describes itself in browsers and search results.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="siteName" label="Site name" errors={err("siteName")} hint={<Counter value={draft.siteName} max={40} />}>
              <Input
                id="siteName"
                value={draft.siteName}
                maxLength={60}
                onChange={(e) => patch((d) => ({ ...d, siteName: e.target.value }), ["siteName"])}
                aria-invalid={!!err("siteName")}
              />
            </FormField>
            <FormField id="tagline" label="Tagline" errors={err("tagline")} hint={<Counter value={draft.tagline} max={120} />}>
              <Input
                id="tagline"
                value={draft.tagline}
                maxLength={150}
                onChange={(e) => patch((d) => ({ ...d, tagline: e.target.value }), ["tagline"])}
                aria-invalid={!!err("tagline")}
              />
            </FormField>
            <FormField
              id="seoDescription"
              label="Search description"
              className="sm:col-span-2"
              errors={err("seoDescription")}
              hint={
                <span className="flex justify-between gap-3">
                  <span>Used by pages that have no description of their own. Aim for 120–160 characters.</span>
                  <Counter value={draft.seoDescription} max={200} />
                </span>
              }
            >
              <Textarea
                id="seoDescription"
                rows={3}
                maxLength={240}
                value={draft.seoDescription}
                onChange={(e) => patch((d) => ({ ...d, seoDescription: e.target.value }), ["seoDescription"])}
                aria-invalid={!!err("seoDescription")}
              />
            </FormField>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Search preview</span>
            <div className="grid gap-1 rounded-lg border bg-muted/30 p-4">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {(draft.siteName.trim()[0] ?? "V").toUpperCase()}
                </span>
                {siteHost}
              </span>
              <span className="truncate text-base font-medium text-info">
                {draft.siteName.trim() || "Site name"}
                {draft.tagline.trim() ? ` — ${draft.tagline.trim()}` : ""}
              </span>
              <span className="line-clamp-2 text-sm text-muted-foreground">{draft.seoDescription.trim() || "No description yet."}</span>
            </div>
          </div>
        </Section>

        {/* Announcement ------------------------------------------------------------- */}
        <Section
          id="announcement"
          icon={MegaphoneIcon}
          title="Announcement bar"
          description="A short message at the top of every public page — maintenance windows, new locations, anything time-sensitive."
          aside={
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch
                checked={a.enabled}
                onCheckedChange={(v) => patch((d) => ({ ...d, announcement: { ...d.announcement, enabled: v } }), ["announcement.text"])}
                aria-label="Show the announcement bar"
              />
              <span className="hidden sm:inline">{a.enabled ? "Shown" : "Hidden"}</span>
            </label>
          }
        >
          <FormField
            id="announcement-text"
            label="Message"
            errors={err("announcement.text")}
            hint={<Counter value={a.text} max={280} />}
          >
            <Textarea
              id="announcement-text"
              rows={2}
              maxLength={320}
              value={a.text}
              placeholder="e.g. New servers in Japan and Brazil are live."
              onChange={(e) => patch((d) => ({ ...d, announcement: { ...d.announcement, text: e.target.value } }), ["announcement.text"])}
              aria-invalid={!!err("announcement.text")}
            />
          </FormField>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Tone</legend>
            <div className="grid grid-cols-3 gap-2 sm:w-fit">
              {TONES.map((t) => {
                const Icon = t.icon;
                return (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
                  >
                    <input
                      type="radio"
                      name="announcement-tone"
                      value={t.value}
                      checked={a.tone === t.value}
                      onChange={() => patch((d) => ({ ...d, announcement: { ...d.announcement, tone: t.value } }))}
                      className="sr-only"
                    />
                    <Icon className="size-3.5" />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <FormField id="announcement-link-label" label="Link label" optional errors={err("announcement.linkLabel")}>
              <Input
                id="announcement-link-label"
                value={a.linkLabel}
                maxLength={40}
                placeholder="See status"
                onChange={(e) =>
                  patch((d) => ({ ...d, announcement: { ...d.announcement, linkLabel: e.target.value } }), ["announcement.linkLabel", "announcement.linkUrl"])
                }
                aria-invalid={!!err("announcement.linkLabel")}
              />
            </FormField>
            <FormField
              id="announcement-link-url"
              label="Link"
              optional
              errors={err("announcement.linkUrl")}
              hint="A page of this site such as /server-status, or an https:// address."
            >
              <Input
                id="announcement-link-url"
                value={a.linkUrl}
                maxLength={300}
                placeholder="/server-status"
                spellCheck={false}
                autoCapitalize="none"
                onChange={(e) =>
                  patch((d) => ({ ...d, announcement: { ...d.announcement, linkUrl: e.target.value } }), ["announcement.linkUrl", "announcement.linkLabel"])
                }
                aria-invalid={!!err("announcement.linkUrl")}
              />
            </FormField>
          </div>
          <div className="grid gap-1.5">
            <span className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Live preview
              {!a.enabled ? <Badge variant="muted">Hidden on the site</Badge> : <Badge variant="success">Visible on every page</Badge>}
            </span>
            <div className={cn("overflow-hidden rounded-lg border bg-background transition-opacity", !a.enabled && "opacity-55")}>
              <div className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2 text-center text-sm font-medium", tone.bar)}>
                <tone.icon className="size-4 shrink-0" />
                <span className="min-w-0 break-words text-foreground">{a.text.trim() || "Your message appears here."}</span>
                {a.linkLabel.trim() ? (
                  <span className="inline-flex items-center gap-1 underline underline-offset-4">
                    {a.linkLabel.trim()}
                    <ExternalLinkIcon className="size-3" />
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3 px-4 py-3" aria-hidden>
                <span className="size-5 rounded-md bg-primary/80" />
                <span className="h-2.5 w-24 rounded-full bg-muted" />
                <span className="ml-auto hidden gap-2 sm:flex">
                  <span className="h-2.5 w-12 rounded-full bg-muted" />
                  <span className="h-2.5 w-12 rounded-full bg-muted" />
                  <span className="h-2.5 w-12 rounded-full bg-muted" />
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* Display ------------------------------------------------------------------- */}
        <Section
          id="display"
          icon={EyeIcon}
          title="Public display"
          description="What the protocol, country and status pages reveal about your servers and usage."
        >
          <div className="grid gap-3">
            <ToggleRow
              id="display-hostnames"
              title="Show server hostnames"
              checked={draft.display.showHostnames}
              onChange={(v) => patch((d) => ({ ...d, display: { ...d.display, showHostnames: v } }))}
              description="Each server card and the status page show the VPN hostname users connect to (they receive it with their account anyway). The server's IP address, management API port and credentials are never shown."
              example={draft.display.showHostnames ? "de1.example.net" : "Hidden"}
            />
            <ToggleRow
              id="display-stats"
              title="Show account statistics"
              checked={draft.display.showStats}
              onChange={(v) => patch((d) => ({ ...d, display: { ...d.display, showStats: v } }))}
              description="Footer counters with the number of accounts created in total and today, per protocol. Turn off to keep usage private."
              example={draft.display.showStats ? "12 840 accounts · +96 today" : "Hidden"}
            />
          </div>
        </Section>

        {/* Quotas -------------------------------------------------------------------- */}
        <Section
          id="quotas"
          icon={ClockIcon}
          title="Quotas & resets"
          description="Each server and protocol can have a creation quota (set per server under Servers → Protocols). Every quota starts again at these local times."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid content-start gap-2">
              <span className="text-sm font-medium">Reset times</span>
              <ul className="grid gap-2">
                {draft.quota.resetTimes.map((r, i) => (
                  <li key={r.id} className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={60}
                        value={r.value}
                        aria-label={`Reset time ${i + 1}`}
                        aria-invalid={!!err(`quota.resetTimes.${i}`)}
                        className="w-36 font-mono tabular-nums"
                        onChange={(e) =>
                          patch(
                            (d) => ({
                              ...d,
                              quota: { ...d.quota, resetTimes: d.quota.resetTimes.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)) },
                            }),
                            ["quota.resetTimes"],
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove reset time ${r.value || i + 1}`}
                        disabled={draft.quota.resetTimes.length <= 1}
                        onClick={() =>
                          patch((d) => ({ ...d, quota: { ...d.quota, resetTimes: d.quota.resetTimes.filter((x) => x.id !== r.id) } }), ["quota.resetTimes"])
                        }
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                    {err(`quota.resetTimes.${i}`) ? <p className="text-xs text-destructive">{err(`quota.resetTimes.${i}`)![0]}</p> : null}
                  </li>
                ))}
              </ul>
              {err("quota.resetTimes") ? <p className="text-xs text-destructive">{err("quota.resetTimes")![0]}</p> : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={draft.quota.resetTimes.length >= 24}
                  onClick={() => patch((d) => ({ ...d, quota: { ...d.quota, resetTimes: [...d.quota.resetTimes, newRow("")] } }), ["quota.resetTimes"])}
                >
                  <PlusIcon /> Add time
                </Button>
                <span className="mx-1 text-xs text-muted-foreground">or</span>
                {RESET_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => patch((d) => ({ ...d, quota: { ...d.quota, resetTimes: p.times.map((t) => newRow(t)) } }), ["quota.resetTimes"])}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid content-start gap-4">
              <FormField id="quota-timezone" label="Time zone" errors={err("quota.timezone")} hint="The reset times are wall-clock times in this zone.">
                <TimeZonePicker
                  id="quota-timezone"
                  value={draft.quota.timezone}
                  options={zones}
                  invalid={!!err("quota.timezone")}
                  onChange={(tz) => patch((d) => ({ ...d, quota: { ...d.quota, timezone: tz } }), ["quota.timezone"])}
                />
              </FormField>
              <FormField
                id="quota-default"
                label="Default quota for new protocols"
                optional
                errors={err("quota.defaultLimit")}
                hint="Applied when a server first reports a protocol. Leave blank for no quota (only the account limits apply)."
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="quota-default"
                    inputMode="numeric"
                    value={draft.quota.defaultLimit}
                    placeholder="No quota"
                    className="w-36 tabular-nums"
                    onChange={(e) => patch((d) => ({ ...d, quota: { ...d.quota, defaultLimit: e.target.value } }), ["quota.defaultLimit"])}
                    aria-invalid={!!err("quota.defaultLimit")}
                  />
                  <span className="text-sm text-muted-foreground">accounts per period</span>
                </div>
              </FormField>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <RotateCcwIcon className="size-4 text-primary" />
                {schedule ? (
                  <>
                    Next reset in <span className="tabular-nums">{formatCountdown(schedule.nextReset.getTime() - (now ?? 0))}</span>
                  </>
                ) : now === null ? (
                  "Calculating the next reset…"
                ) : (
                  "Add a valid reset time to see the schedule"
                )}
              </p>
              {schedule ? (
                <p className="text-xs text-muted-foreground">
                  {formatLocal(schedule.nextReset, draft.quota.timezone)} {draft.quota.timezone.replace(/_/g, " ")} · {formatLocal(schedule.nextReset)} your time
                </p>
              ) : null}
            </div>
            <DayTimeline times={sortedTimes} nowMinutes={nowMinutes} />
            <p className="text-xs text-muted-foreground">
              {sortedTimes.length > 0
                ? `Quotas reset ${sortedTimes.length === 1 ? "once a day" : `${sortedTimes.length} times a day`} at ${sortedTimes.join(", ")}. Accounts that already exist are not affected; users see the remaining slots and the reset time on every server.`
                : "No reset times yet."}
            </p>
          </div>
        </Section>

        {/* Health -------------------------------------------------------------------- */}
        <Section
          id="health"
          icon={GaugeIcon}
          title="Health monitor"
          description="The background worker checks every published server and records its status and latency for the public status page."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="health-interval"
              label="Check interval"
              errors={err("health.intervalSeconds")}
              hint={Number.isFinite(interval) && interval > 0 ? `Every ${humanSeconds(interval)} · 30 to 3600 seconds` : "30 to 3600 seconds"}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="health-interval"
                  inputMode="numeric"
                  value={draft.health.intervalSeconds}
                  className="w-28 tabular-nums"
                  onChange={(e) => patch((d) => ({ ...d, health: { ...d.health, intervalSeconds: e.target.value } }), ["health.intervalSeconds"])}
                  aria-invalid={!!err("health.intervalSeconds")}
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
            </FormField>
            <FormField
              id="health-threshold"
              label="Failures before offline"
              errors={err("health.failureThreshold")}
              hint="Consecutive failed checks before a server is shown as offline (1 to 10)."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="health-threshold"
                  inputMode="numeric"
                  value={draft.health.failureThreshold}
                  className="w-28 tabular-nums"
                  onChange={(e) => patch((d) => ({ ...d, health: { ...d.health, failureThreshold: e.target.value } }), ["health.failureThreshold"])}
                  aria-invalid={!!err("health.failureThreshold")}
                />
                <span className="text-sm text-muted-foreground">checks</span>
              </div>
            </FormField>
          </div>
          {Number.isFinite(interval) && interval >= 30 && Number.isFinite(threshold) && threshold >= 1 ? (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" />
              <span>
                An unreachable server is marked offline after about{" "}
                <span className="font-medium text-foreground">{humanSeconds(interval * threshold)}</span> and comes back online with the first successful
                check. Shorter intervals react faster but send more requests to your servers.
              </span>
            </p>
          ) : null}
        </Section>

        {/* Avatars ------------------------------------------------------------------- */}
        <Section
          id="avatars"
          icon={PaletteIcon}
          title="Avatars"
          description="Every VPN account and administrator gets an avatar generated from its id with DiceBear, on this server — no third-party requests. Choosing a style changes the avatars of all users at once."
        >
          <div role="radiogroup" aria-label="Avatar style" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {styles.map((s) => (
              <label
                key={s.key}
                className="group relative grid cursor-pointer gap-3 rounded-xl border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40 has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
              >
                <input
                  type="radio"
                  name="avatarStyle"
                  value={s.key}
                  checked={draft.avatarStyle === s.key}
                  onChange={() => patch((d) => ({ ...d, avatarStyle: s.key }), ["avatarStyle"])}
                  className="sr-only"
                />
                <span className="flex -space-x-2">
                  {s.previews.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- same-origin SVG generated on the server
                    <img
                      key={src}
                      src={src}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      draggable={false}
                      className="size-10 rounded-full bg-muted ring-2 ring-card"
                    />
                  ))}
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{s.license}</span>
                </span>
                <span className="absolute top-2.5 right-2.5 hidden size-5 items-center justify-center rounded-full bg-primary text-primary-foreground group-has-[:checked]:flex">
                  <CheckIcon className="size-3" />
                </span>
              </label>
            ))}
          </div>
          {err("avatarStyle") ? <p className="text-xs text-destructive">{err("avatarStyle")![0]}</p> : null}
          <p className="text-xs text-muted-foreground">
            All offered styles are licensed for commercial use without attribution (CC0 or free for personal and commercial use).
          </p>
        </Section>

        {/* Contact ------------------------------------------------------------------- */}
        <Section id="contact" icon={MailIcon} title="Contact" description="Shown on the contact page and in the footer. Leave a field blank to hide it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="contact-email" label="Support email" optional errors={err("contact.email")}>
              <Input
                id="contact-email"
                type="email"
                value={draft.contact.email}
                maxLength={254}
                placeholder="support@example.com"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => patch((d) => ({ ...d, contact: { ...d.contact, email: e.target.value } }), ["contact.email"])}
                aria-invalid={!!err("contact.email")}
              />
            </FormField>
            <FormField id="contact-telegram" label="Telegram" optional errors={err("contact.telegramUrl")} hint="A https://t.me/… link to a channel, group or account.">
              <Input
                id="contact-telegram"
                value={draft.contact.telegramUrl}
                maxLength={200}
                placeholder="https://t.me/yourchannel"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => patch((d) => ({ ...d, contact: { ...d.contact, telegramUrl: e.target.value } }), ["contact.telegramUrl"])}
                aria-invalid={!!err("contact.telegramUrl")}
              />
            </FormField>
          </div>
        </Section>

        {/* Rules --------------------------------------------------------------------- */}
        <Section
          id="rules"
          icon={ScrollTextIcon}
          title="Account rules"
          description="Short rules shown next to every account form. Users accept them when they create an account."
          aside={<Badge variant="muted">{draft.rules.length}/10</Badge>}
        >
          <ol className="grid gap-2">
            {draft.rules.map((r, i) => (
              <li key={r.id} className="grid gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                  <Input
                    value={r.value}
                    maxLength={100}
                    aria-label={`Rule ${i + 1}`}
                    placeholder="e.g. No torrenting or P2P"
                    aria-invalid={!!err(`rules.${i}`)}
                    onChange={(e) => patch((d) => ({ ...d, rules: d.rules.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)) }), ["rules"])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move rule ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => patch((d) => ({ ...d, rules: swap(d.rules, i, i - 1) }), ["rules"])}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move rule ${i + 1} down`}
                    disabled={i === draft.rules.length - 1}
                    onClick={() => patch((d) => ({ ...d, rules: swap(d.rules, i, i + 1) }), ["rules"])}
                    className="hidden sm:inline-flex"
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove rule ${i + 1}`}
                    onClick={() => patch((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }), ["rules"])}
                  >
                    <TrashIcon />
                  </Button>
                </div>
                {err(`rules.${i}`) ? <p className="pl-6 text-xs text-destructive">{err(`rules.${i}`)![0]}</p> : null}
              </li>
            ))}
            {draft.rules.length === 0 ? <li className="text-sm text-muted-foreground">No rules. The account forms show none.</li> : null}
          </ol>
          {err("rules") ? <p className="text-xs text-destructive">{err("rules")![0]}</p> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={draft.rules.length >= 10}
            onClick={() => patch((d) => ({ ...d, rules: [...d.rules, newRow("")] }), ["rules"])}
          >
            <PlusIcon /> Add rule
          </Button>
        </Section>

        {/* Save bar ------------------------------------------------------------------ */}
        <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm" aria-live="polite">
              {dirty ? (
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2 shrink-0 rounded-full bg-warning" />
                  Unsaved changes
                </span>
              ) : (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2Icon className="size-4 shrink-0 text-success" />
                  All changes saved
                </span>
              )}
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty || pending}
              onClick={() => {
                setDraft(toDraft(saved));
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button type="submit" disabled={!dirty || pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
              Save<span className="hidden sm:inline"> settings</span>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function swap<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Which settings section a field error key ("quota.resetTimes.1") belongs to. */
function sectionOf(key: string): string {
  const top = key.split(".")[0];
  switch (top) {
    case "siteName":
    case "tagline":
    case "seoDescription":
      return "general";
    case "announcement":
      return "announcement";
    case "display":
      return "display";
    case "quota":
      return "quotas";
    case "health":
      return "health";
    case "avatarStyle":
      return "avatars";
    case "contact":
      return "contact";
    case "rules":
      return "rules";
    default:
      return "general";
  }
}

/** "17:00" in a time zone (or the browser's own zone when omitted). */
function formatLocal(d: Date, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(d);
  } catch {
    return "—";
  }
}

/** 24-hour strip: reset points as ticks, the current local time as a marker, alternate windows shaded. */
function DayTimeline({ times, nowMinutes }: { times: string[]; nowMinutes: number | null }) {
  const points = times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  return (
    <div className="grid gap-1" aria-hidden>
      <div className="relative h-7 overflow-hidden rounded-md border bg-card">
        {points.map((p, i) => {
          const next = points[i + 1] ?? 1440;
          return i % 2 === 0 ? <span key={`w${p}`} className="absolute inset-y-0 bg-primary/8" style={{ left: pct(p), width: pct(next - p) }} /> : null;
        })}
        {points.map((p) => (
          <span key={p} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: pct(p) }} />
        ))}
        {nowMinutes !== null ? (
          <span className="absolute inset-y-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(nowMinutes) }}>
            <span className="size-2 -translate-y-0.5 rounded-full bg-warning ring-2 ring-card" />
            <span className="w-px flex-1 bg-warning" />
          </span>
        ) : null}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
