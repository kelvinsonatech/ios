"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  CircleCheckBigIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  RotateCcwIcon,
  SendIcon,
  SnailIcon,
  UserXIcon,
  WifiOffIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, requestJson } from "@/components/public/account/api";
import { friendlyError, normalizeFieldErrors, type FriendlyError } from "@/components/public/account/errors";
import { FormErrorAlert } from "@/components/public/account/form-error";
import { Turnstile, type TurnstileHandle } from "@/components/public/account/turnstile";
import { cn } from "@/lib/utils";
import { REPORT_CATEGORIES } from "@/lib/public/report-categories";
import type { CreateReportRequest, ReportCategory } from "@/lib/public/types";
import { decodeTarget, encodeTarget, type ReportServerOption } from "./report-target";

/**
 * "Report a problem" form → POST /api/public/reports. The server list comes from the status data
 * (grouped by protocol); ?server=&protocol= preselects one (see report-target.ts). Same contract
 * style as account creation: JSON, captcha when enabled, friendly errors, the server's fieldErrors win.
 */
const CATEGORY_META: Record<ReportCategory, { icon: React.ReactNode; hint: string }> = {
  connection: { icon: <WifiOffIcon />, hint: "The app won't connect or drops right away." },
  slow: { icon: <SnailIcon />, hint: "Connected, but slow or unstable." },
  account: { icon: <UserXIcon />, hint: "Login rejected or the details don't work." },
  other: { icon: <MessageCircleQuestionMarkIcon />, hint: "Anything else we should know." },
};
const CATEGORY_KEYS = Object.keys(REPORT_CATEGORIES) as ReportCategory[];
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 2000;
const EMAIL = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]+$/;

type FieldKey = "server" | "category" | "message" | "contactEmail";

export function ReportForm({
  options,
  initialValue,
  captchaSiteKey,
  nonce,
}: {
  options: ReportServerOption[];
  /** Preselected "<protocol>|<serverId>" (see initialTarget). */
  initialValue: string;
  captchaSiteKey: string | null;
  nonce?: string;
}) {
  const ids = useId();
  const [target, setTarget] = useState(initialValue);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<FriendlyError | null>(null);
  const [otherErrors, setOtherErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: string } | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const trimmed = message.trim();
  const clientErrors: Partial<Record<FieldKey, string>> = {};
  if (!category) clientErrors.category = "Choose what's wrong.";
  if (trimmed.length < MIN_MESSAGE) clientErrors.message = `Please describe the problem in at least ${MIN_MESSAGE} characters.`;
  else if (trimmed.length > MAX_MESSAGE) clientErrors.message = `Please keep it under ${MAX_MESSAGE} characters.`;
  if (email.trim() && !EMAIL.test(email.trim())) clientErrors.contactEmail = "Enter a valid email address, or leave it empty.";
  const errorFor = (k: FieldKey) => serverErrors[k] ?? (showErrors ? clientErrors[k] : undefined);
  const clearServerError = (k: FieldKey) => setServerErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyRef.current) return;
    setShowErrors(true);
    const first = (["category", "message", "contactEmail"] as FieldKey[]).find((k) => clientErrors[k]);
    if (first) {
      document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    if (captchaSiteKey && !captchaToken) {
      setCaptchaMissing(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFormError(null);
    setOtherErrors([]);
    setServerErrors({});
    const t = decodeTarget(target);
    const body: CreateReportRequest = {
      serverId: t.serverId,
      protocol: t.protocol,
      category: category!,
      message: trimmed,
      contactEmail: email.trim() || null,
      captchaToken: captchaToken ?? null,
    };
    try {
      const { data } = await requestJson<{ id: string }>("/api/public/reports", { method: "POST", body });
      setSent({ id: typeof data?.id === "string" ? data.id : "" });
    } catch (err) {
      setFormError(friendlyError(err, { protocolName: "This service", serverName: "this server" }));
      if (err instanceof ApiError) {
        const fe = normalizeFieldErrors(err.details.fieldErrors, ["serverId", "protocol", "category", "message", "contactEmail"]);
        const se: Partial<Record<FieldKey, string>> = {};
        if (fe.byField.serverId || fe.byField.protocol) se.server = fe.byField.serverId ?? fe.byField.protocol;
        if (fe.byField.category) se.category = fe.byField.category;
        if (fe.byField.message) se.message = fe.byField.message;
        if (fe.byField.contactEmail) se.contactEmail = fe.byField.contactEmail;
        setServerErrors(se);
        setOtherErrors(fe.other);
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      busyRef.current = false;
      setBusy(false);
      turnstileRef.current?.reset();
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-12 text-center shadow-sm animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none" role="status">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-success-soft text-success">
          <CircleCheckBigIcon className="size-8" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight">Thanks — we&apos;re on it</h2>
        <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">
          Your report reached our team. We check every one and fix server problems as quickly as we can.
          {email.trim() ? " If we need more details, we'll email you." : ""}
        </p>
        {sent.id ? (
          <p className="mt-4 rounded-lg bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
            Reference #{sent.id.replace(/-/g, "").slice(0, 8).toUpperCase()}
          </p>
        ) : null}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-11">
            <Link href="/server-status">
              <ActivityIcon aria-hidden />
              View server status
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              setSent(null);
              setMessage("");
              setCategory(null);
              setShowErrors(false);
            }}
          >
            <RotateCcwIcon aria-hidden />
            Send another report
          </Button>
        </div>
      </div>
    );
  }

  const serverId = `${ids}-server`;
  const messageId = `${ids}-message`;
  const emailId = `${ids}-contactEmail`;
  const count = trimmed.length;

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-6 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
      {formError ? <FormErrorAlert ref={errorRef} error={formError} details={otherErrors} /> : null}

      <div className="grid gap-2">
        <label htmlFor={serverId} className="text-sm font-medium">
          Which server? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <NativeSelect
          id={serverId}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            clearServerError("server");
          }}
          aria-invalid={!!errorFor("server") || undefined}
          aria-describedby={errorFor("server") ? `${serverId}-error` : `${serverId}-help`}
          className="h-11"
        >
          <option value="">Not sure / general problem</option>
          {options.map((o) => (
            <optgroup key={o.protocol.slug} label={o.protocol.name}>
              <option value={encodeTarget(o.protocol.slug, null)}>Any {o.protocol.name} server</option>
              {o.servers.map((s) => (
                <option key={s.id} value={encodeTarget(o.protocol.slug, s.id)}>
                  {s.name} — {s.location}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {errorFor("server") ? (
          <p id={`${serverId}-error`} className="text-xs font-medium text-destructive">
            {errorFor("server")}
          </p>
        ) : (
          <p id={`${serverId}-help`} className="text-xs text-muted-foreground">
            Picking the exact server helps us find the problem faster.
          </p>
        )}
      </div>

      <fieldset className="grid gap-2" aria-describedby={errorFor("category") ? `${ids}-category-error` : undefined}>
        <legend className="mb-2 text-sm font-medium">
          What&apos;s wrong?{" "}
          <span className="text-destructive" aria-hidden>
            *
          </span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORY_KEYS.map((key, i) => (
            <label key={key} className="relative block">
              <input
                id={i === 0 ? `${ids}-category` : undefined}
                type="radio"
                name="category"
                value={key}
                checked={category === key}
                onChange={() => {
                  setCategory(key);
                  clearServerError("category");
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full min-h-16 cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3.5 transition-[border-color,box-shadow,background-color] peer-checked:border-primary peer-checked:bg-accent/50 peer-checked:shadow-[0_0_0_1px_var(--primary)] peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 hover:border-primary/40 motion-reduce:transition-none",
                  errorFor("category") && "border-destructive/60",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-4.5" aria-hidden>
                  {CATEGORY_META[key].icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{REPORT_CATEGORIES[key]}</span>
                  <span className="block text-xs text-muted-foreground">{CATEGORY_META[key].hint}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
        {errorFor("category") ? (
          <p id={`${ids}-category-error`} className="text-xs font-medium text-destructive">
            {errorFor("category")}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={messageId} className="text-sm font-medium">
            Describe the problem{" "}
            <span className="text-destructive" aria-hidden>
              *
            </span>
            <span className="sr-only">(required)</span>
          </label>
          <span className={cn("text-xs tabular-nums", count > MAX_MESSAGE ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {count} / {MAX_MESSAGE}
          </span>
        </div>
        <Textarea
          id={messageId}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value.slice(0, MAX_MESSAGE + 200));
            clearServerError("message");
          }}
          rows={6}
          placeholder="What happened, which app and port you used, and since when…"
          aria-invalid={!!errorFor("message") || undefined}
          aria-describedby={errorFor("message") ? `${messageId}-error` : `${messageId}-help`}
          className="min-h-36 text-[15px] sm:text-sm"
        />
        {errorFor("message") ? (
          <p id={`${messageId}-error`} className="text-xs font-medium text-destructive">
            {errorFor("message")}
          </p>
        ) : (
          <p id={`${messageId}-help`} className="text-xs text-muted-foreground">
            Please don&apos;t include passwords or private keys.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          Email for a reply <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(e) => {
            setEmail(e.target.value);
            clearServerError("contactEmail");
          }}
          placeholder="you@example.com"
          aria-invalid={!!errorFor("contactEmail") || undefined}
          aria-describedby={errorFor("contactEmail") ? `${emailId}-error` : `${emailId}-help`}
          className="h-11 text-[15px] sm:text-sm"
        />
        {errorFor("contactEmail") ? (
          <p id={`${emailId}-error`} className="text-xs font-medium text-destructive">
            {errorFor("contactEmail")}
          </p>
        ) : (
          <p id={`${emailId}-help`} className="text-xs text-muted-foreground">
            Only used to answer this report.
          </p>
        )}
      </div>

      {captchaSiteKey ? (
        <div className="grid gap-1.5">
          <Turnstile
            ref={turnstileRef}
            siteKey={captchaSiteKey}
            nonce={nonce}
            action="report"
            onToken={(t) => {
              setCaptchaToken(t);
              if (t) setCaptchaMissing(false);
            }}
          />
          {captchaMissing ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              Please complete the security check.
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-xl text-base sm:w-auto sm:justify-self-start sm:px-8">
        {busy ? <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <SendIcon className="size-5" aria-hidden />}
        {busy ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
