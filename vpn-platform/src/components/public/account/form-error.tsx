"use client";

import { CircleAlertIcon } from "lucide-react";
import { Countdown } from "@/components/public/live-time";
import { cn } from "@/lib/utils";
import type { FriendlyError } from "./errors";

/** Error summary above a form (focusable so it can receive focus after a failed submit). */
export function FormErrorAlert({
  error,
  details,
  children,
  className,
  ref,
}: {
  error: FriendlyError;
  /** Extra messages that do not belong to a single field. */
  details?: string[];
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 outline-none animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none",
        className,
      )}
    >
      <CircleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-destructive">{error.title}</p>
        <p className="mt-0.5 text-foreground/80">
          {error.message}
          {error.resetsAt ? (
            <>
              {" "}
              <Countdown iso={error.resetsAt} label="New slots open" doneText="New slots are open now" className="font-medium text-foreground" />.
            </>
          ) : null}
          {error.retryAt ? (
            <>
              {" "}
              <Countdown iso={error.retryAt} label="You can try again" doneText="You can try again now" className="font-medium text-foreground" />.
            </>
          ) : null}
        </p>
        {details?.length ? (
          <ul className="mt-1.5 list-disc pl-4 text-foreground/80">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {children}
      </div>
    </div>
  );
}
