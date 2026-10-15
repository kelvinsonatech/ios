"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRightIcon, Clock3Icon, InfoIcon, SparklesIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isExternalHref, safeHref } from "@/lib/seo";
import type { PublicSiteSettings } from "@/lib/public/types";
import { Countdown } from "./live-time";

const DISMISS_KEY = "vl:announcement-dismissed";
const listeners = new Set<() => void>();
let memoryDismissed: string | null = null;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) ?? memoryDismissed;
  } catch {
    return memoryDismissed;
  }
}

/** Short stable id for an announcement text, so a new announcement shows again after a dismissal. */
function textId(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const TONES = {
  info: { icon: InfoIcon, row: "bg-info-soft", iconClass: "text-info" },
  success: { icon: SparklesIcon, row: "bg-success-soft", iconClass: "text-success" },
  warning: { icon: TriangleAlertIcon, row: "bg-warning-soft", iconClass: "text-warning-strong" },
} as const;

/**
 * Top of every public page: a slim gradient bar with the slot reset schedule (and a live countdown
 * to the next reset), plus the admin's announcement (Settings → Announcement) in its tone colour,
 * dismissible for the rest of the browser session.
 */
export function AnnouncementBar({
  announcement,
  resetTimesLabel,
  timeZoneLabel,
  nextResetAt,
}: {
  announcement: PublicSiteSettings["announcement"];
  resetTimesLabel: string;
  timeZoneLabel: string;
  nextResetAt: string | null;
}) {
  const id = textId(announcement.text);
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => null) === id;
  const showAnnouncement = announcement.enabled && announcement.text.trim() !== "" && !dismissed;
  const href = safeHref(announcement.linkUrl);
  const tone = TONES[announcement.tone] ?? TONES.info;

  const dismiss = () => {
    memoryDismissed = id;
    try {
      window.sessionStorage.setItem(DISMISS_KEY, id);
    } catch {
      // Storage blocked: the in-memory flag still hides it until the next full page load.
    }
    for (const l of listeners) l();
  };

  return (
    <section aria-label="Site notices" className="relative">
      <div className="bg-bar text-white">
        <div className="mx-auto flex min-h-9 max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-center text-xs sm:justify-between sm:px-6 sm:text-[13px]">
          <p className="flex items-center gap-2">
            <Clock3Icon className="size-3.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              Free slots reset daily at <strong className="font-semibold tabular-nums">{resetTimesLabel}</strong>{" "}
              <span className="text-white/75">({timeZoneLabel})</span>
            </span>
          </p>
          {nextResetAt ? (
            <p className="hidden items-center gap-1.5 text-white/80 sm:flex" aria-live="off">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-70 motion-reduce:hidden" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
              </span>
              <Countdown iso={nextResetAt} label="Next reset" doneText="Resetting now" />
            </p>
          ) : null}
        </div>
      </div>
      {showAnnouncement ? (
        <div className={cn("border-b border-border/60", tone.row)} role="region" aria-label="Announcement">
          <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2 text-sm sm:items-center sm:px-6">
            <tone.icon className={cn("mt-0.5 size-4 shrink-0 sm:mt-0", tone.iconClass)} aria-hidden />
            <p className="min-w-0 flex-1 text-pretty">
              <span>{announcement.text}</span>
              {href ? (
                <>
                  {" "}
                  <Link
                    href={href}
                    {...(isExternalHref(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="inline-flex items-center gap-1 font-semibold whitespace-nowrap underline decoration-current/30 underline-offset-4 hover:decoration-current"
                  >
                    {announcement.linkLabel || "Learn more"}
                    <ArrowRightIcon className="size-3.5" aria-hidden />
                  </Link>
                </>
              ) : null}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss announcement"
              className="-my-2 -mr-2.5 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-white/10"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
