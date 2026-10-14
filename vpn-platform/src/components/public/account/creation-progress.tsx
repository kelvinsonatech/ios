"use client";

import { CheckIcon, LoaderCircleIcon, RefreshCwIcon, RotateCcwIcon, ServerIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "received" | "creating" | "ready";

/**
 * "Request received → Creating on <server> → Ready" while the account is provisioned. Step
 * changes are announced politely to screen readers. After ~2 minutes the hook gives up polling and
 * this offers "Check again" (the request keeps running on our side).
 */
export function CreationProgress({
  serverName,
  step,
  connectionIssue,
  timedOut,
  onCheckAgain,
  onStartOver,
}: {
  serverName: string;
  step: Exclude<Step, "ready">;
  connectionIssue: boolean;
  timedOut: boolean;
  onCheckAgain: () => void;
  onStartOver: () => void;
}) {
  const steps: { key: Step; label: string; hint: string }[] = [
    { key: "received", label: "Request received", hint: "Your details passed our checks." },
    { key: "creating", label: `Creating on ${serverName}`, hint: "The server is setting up your account." },
    { key: "ready", label: "Ready", hint: "Your connection details appear here." },
  ];
  const activeIndex = step === "received" ? 0 : 1;
  const announcement = timedOut
    ? "This is taking longer than usual."
    : step === "received"
      ? "Request received. Creating your account."
      : `Creating your account on ${serverName}.`;

  return (
    <div className="grid gap-6 py-2" aria-busy={!timedOut}>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex size-20 items-center justify-center">
          {!timedOut ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/15 motion-reduce:hidden" />
              <span className="absolute inset-2 rounded-full bg-primary/10" />
            </>
          ) : null}
          <span className="relative flex size-14 items-center justify-center rounded-2xl border bg-card text-primary shadow-sm">
            <ServerIcon className="size-6" aria-hidden />
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold">{timedOut ? "Still working on it" : "Creating your account"}</p>
          <p className="text-sm text-muted-foreground">
            {timedOut ? "This is taking longer than usual. Your request is still being processed." : "This usually takes a few seconds. Please keep this page open."}
          </p>
        </div>
      </div>

      <ol className="mx-auto grid w-full max-w-sm gap-0">
        {steps.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 ? (
                <span aria-hidden className={cn("absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 rounded-full", done ? "bg-primary" : "bg-border")} />
              ) : null}
              <span
                className={cn(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-card text-primary",
                  !done && !active && "border-border bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? (
                  <CheckIcon className="size-4" strokeWidth={3} />
                ) : active && !timedOut ? (
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="pt-1">
                <p className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>
                  {s.label}
                  <span className="sr-only">{done ? " (done)" : active ? " (in progress)" : ""}</span>
                </p>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {connectionIssue && !timedOut ? (
        <p className="mx-auto flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-xs text-foreground" role="status">
          <WifiOffIcon className="size-3.5 text-warning" aria-hidden />
          Connection hiccup — retrying automatically…
        </p>
      ) : null}

      {timedOut ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" className="h-11" onClick={onCheckAgain}>
            <RefreshCwIcon aria-hidden />
            Check again
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onStartOver}>
            <RotateCcwIcon aria-hidden />
            Start over
          </Button>
        </div>
      ) : null}
    </div>
  );
}
