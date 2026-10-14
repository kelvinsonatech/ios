"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import Script from "next/script";
import { useTheme } from "next-themes";
import { ShieldAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cloudflare Turnstile, rendered explicitly into our own box. The script is the only third-party
 * code the site loads, and only when captcha is enabled (the page passes the site key, else
 * nothing renders). It carries the per-request CSP nonce. Call `reset()` after every submission:
 * tokens are single-use.
 */
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ): string;
  reset(id?: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  reset(): void;
}

export function Turnstile({
  siteKey,
  nonce,
  action,
  onToken,
  className,
  ref,
}: {
  siteKey: string;
  nonce?: string;
  /** Shown in Cloudflare analytics ("create-account", "report"). */
  action?: string;
  onToken: (token: string | null) => void;
  className?: string;
  ref?: React.Ref<TurnstileHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !api || !box.current) return;
    const id = api.render(box.current, {
      sitekey: siteKey,
      action,
      theme,
      size: "flexible",
      callback: (token) => {
        setFailed(false);
        onTokenRef.current(token);
      },
      "expired-callback": () => onTokenRef.current(null),
      "timeout-callback": () => onTokenRef.current(null),
      "error-callback": () => {
        onTokenRef.current(null);
        setFailed(true);
      },
    });
    widgetId.current = id;
    return () => {
      try {
        api.remove(id);
      } catch {
        // already gone
      }
      widgetId.current = null;
      onTokenRef.current(null);
    };
  }, [ready, siteKey, action, theme]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenRef.current(null);
        if (widgetId.current) {
          try {
            window.turnstile?.reset(widgetId.current);
          } catch {
            // ignore
          }
        }
      },
    }),
    [],
  );

  return (
    <div className={cn("grid gap-2", className)}>
      <Script src={SCRIPT_SRC} nonce={nonce} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setFailed(true)} />
      <div ref={box} className="min-h-[65px] w-full" aria-label="Security check" />
      {failed ? (
        <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
          <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          The security check couldn&apos;t load. Disable content blockers for this site or reload the page.
        </p>
      ) : null}
    </div>
  );
}
