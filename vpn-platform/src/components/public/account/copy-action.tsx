"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyText } from "./browser-actions";

/** Copy button with a short "copied" state and a clipboard fallback for non-secure contexts. */
export function CopyAction({
  value,
  label,
  children,
  variant = "ghost",
  size = "icon-sm",
  className,
  successMessage,
}: {
  value: string | (() => string);
  /** Accessible name, e.g. "Copy password". */
  label: string;
  /** Visible content for text buttons; icon-only when omitted. */
  children?: React.ReactNode;
  variant?: "ghost" | "outline" | "secondary" | "default";
  size?: "icon-sm" | "icon" | "sm" | "default" | "lg";
  className?: string;
  successMessage?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={children ? undefined : label}
      title={children ? undefined : label}
      className={cn(size === "icon-sm" && "size-9", className)}
      onClick={async () => {
        const ok = await copyText(typeof value === "function" ? value() : value);
        if (!ok) {
          toast.error("Couldn't copy. Select the text and copy it manually.");
          return;
        }
        if (successMessage) toast.success(successMessage);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <CheckIcon className="text-success" aria-hidden /> : <CopyIcon aria-hidden />}
      {children}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  );
}
