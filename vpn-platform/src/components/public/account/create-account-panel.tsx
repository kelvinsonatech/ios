"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, LoaderCircleIcon, RotateCcwIcon, ShieldCheckIcon, SparklesIcon, UserRoundPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnavailableNotice } from "@/components/public/server/unavailable-notice";
import { cn } from "@/lib/utils";
import type { PublicAccountResult, PublicCountry, PublicProtocolDetail, PublicServerCard } from "@/lib/public/types";
import { AccountResult } from "./account-result";
import { CreationProgress } from "./creation-progress";
import { normalizeFieldErrors } from "./errors";
import { FormErrorAlert } from "./form-error";
import { AccountFormFields, fieldId } from "./form-fields";
import { initialValues, toRequestInput, validateAll } from "./form-validation";
import { saveAccountSummary } from "./saved-accounts";
import { Turnstile, type TurnstileHandle } from "./turnstile";
import { useAccountCreation } from "./use-account-creation";

/**
 * The create-account card on /<protocol>/<country>/<server>: dynamic form → progress → one-time
 * result, all in place. Client checks mirror the backend rules for instant feedback; the server's
 * fieldErrors always win. Double submits are impossible (the hook ignores calls while busy and the
 * button is disabled).
 */
export function CreateAccountPanel({
  protocol,
  country,
  server,
  siteName,
  captchaSiteKey,
  nonce,
  alternatives,
}: {
  protocol: PublicProtocolDetail;
  country: PublicCountry;
  server: PublicServerCard;
  siteName: string;
  captchaSiteKey: string | null;
  nonce?: string;
  alternatives: PublicServerCard[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(protocol));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  /** Fields edited since the last server response (their server error is stale). */
  const [edited, setEdited] = useState<Set<string>>(() => new Set());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const onReady = useCallback(
    (requestId: string, account: PublicAccountResult, createdAt: string) => {
      saveAccountSummary({
        id: requestId,
        protocol: { slug: account.protocol.slug, name: account.protocol.name },
        server: { name: account.server.name, href: server.href, countryCode: country.code },
        username: account.username ?? null,
        avatar: account.avatar,
        createdAt,
        expiresAt: account.expiresAt,
      });
      // Refresh the server-rendered slot counts next to the result.
      router.refresh();
    },
    [router, server.href, country.code],
  );

  const creation = useAccountCreation({
    serverId: server.id,
    protocolSlug: protocol.slug,
    protocolName: protocol.name,
    serverName: server.name,
    onReady,
  });
  const { state } = creation;

  const keys = useMemo(() => protocol.fields.map((f) => f.key), [protocol.fields]);
  const clientErrors = validateAll(protocol.fields, values, protocol);
  const server422 = normalizeFieldErrors(creation.fieldErrors, keys);
  const errors: Record<string, string | undefined> = {};
  for (const k of keys) {
    const serverErr = edited.has(k) ? undefined : server422.byField[k];
    errors[k] = serverErr ?? (touched[k] || showAll ? clientErrors[k] : undefined);
  }

  const unavailable = server.availability !== "available";
  const busy = state.phase === "submitting";
  const disabled = unavailable || busy;

  const resetForm = () => {
    setValues(initialValues(protocol));
    setTouched({});
    setShowAll(false);
    setEdited(new Set());
    setCaptchaMissing(false);
    turnstileRef.current?.reset();
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setShowAll(true);
    const firstInvalid = keys.find((k) => clientErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }
    if (captchaSiteKey && !captchaToken) {
      setCaptchaMissing(true);
      return;
    }
    setEdited(new Set());
    const ok = await creation.submit(toRequestInput(protocol.fields, values), captchaToken);
    // Turnstile tokens are single-use: always get a fresh one.
    turnstileRef.current?.reset();
    if (!ok) requestAnimationFrame(() => errorRef.current?.focus());
  }

  if (state.phase === "result") {
    return (
      <AccountResult
        account={state.account}
        siteName={siteName}
        countryCode={country.code}
        countryName={country.name}
        guideHref={`/${protocol.slug}#guide`}
        onCreateAnother={() => {
          creation.reset();
          resetForm();
        }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <UserRoundPlusIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">New {protocol.name} account</h2>
          <p className="text-sm text-muted-foreground">Free · created on {server.name} in seconds · comes with its own avatar</p>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {state.phase === "pending" || state.phase === "timeout" ? (
          <CreationProgress
            serverName={server.name}
            step={state.phase === "pending" ? state.step : "creating"}
            connectionIssue={state.phase === "pending" && state.connectionIssue}
            timedOut={state.phase === "timeout"}
            onCheckAgain={creation.checkAgain}
            onStartOver={() => {
              creation.reset();
              resetForm();
            }}
          />
        ) : state.phase === "expired" ? (
          <div className="grid justify-items-center gap-3 py-6 text-center">
            <p className="text-lg font-semibold">These details are no longer available</p>
            <p className="max-w-md text-sm text-muted-foreground">
              For your security, account details are only kept for a short time after creation. If you didn&apos;t save them, please create a new
              account.
            </p>
            <Button type="button" className="mt-2 h-11" onClick={() => { creation.reset(); resetForm(); }}>
              <RotateCcwIcon aria-hidden />
              Create a new account
            </Button>
          </div>
        ) : state.phase === "failed" ? (
          <div className="grid gap-4">
            <FormErrorAlert error={state.error} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="h-11" onClick={creation.backToForm}>
                <RotateCcwIcon aria-hidden />
                Try again
              </Button>
              <Button asChild variant="ghost" className="h-11">
                <Link href={`/${protocol.slug}/${country.slug}`}>
                  Choose another server
                  <ArrowRightIcon aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-describedby={unavailable ? "server-unavailable" : undefined}>
            {unavailable ? (
              <div id="server-unavailable">
                <UnavailableNotice
                  availability={server.availability as Exclude<typeof server.availability, "available">}
                  protocolName={protocol.name}
                  protocolHref={`/${protocol.slug}`}
                  quotaResetsAt={server.capacity.quotaResetsAt}
                  alternatives={alternatives}
                />
              </div>
            ) : null}

            {creation.formError ? (
              <FormErrorAlert ref={errorRef} error={creation.formError} details={server422.other}>
                {creation.formError.suggestOtherServer ? (
                  <Link href={`/${protocol.slug}/${country.slug}`} className="mt-1.5 inline-flex min-h-8 items-center gap-1 font-medium text-primary hover:underline">
                    See other servers in {country.name}
                    <ArrowRightIcon className="size-3.5" aria-hidden />
                  </Link>
                ) : null}
              </FormErrorAlert>
            ) : null}

            <fieldset disabled={disabled} className={cn("grid gap-5", unavailable && "opacity-60")}>
              <legend className="sr-only">Account details</legend>
              <AccountFormFields
                protocol={protocol}
                values={values}
                errors={errors}
                disabled={disabled}
                onChange={(key, value) => {
                  setValues((v) => ({ ...v, [key]: value }));
                  if (!edited.has(key)) setEdited((s) => new Set(s).add(key));
                }}
                onBlur={(key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))}
              />
            </fieldset>

            {captchaSiteKey && !unavailable ? (
              <div className="grid gap-1.5">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={captchaSiteKey}
                  nonce={nonce}
                  action="create-account"
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

            <div className="grid gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={disabled}
                aria-disabled={disabled}
                className="h-12 w-full rounded-xl text-base shadow-sm shadow-primary/20 transition-[transform,background-color,box-shadow] active:scale-[0.99] motion-reduce:transition-none"
              >
                {busy ? (
                  <>
                    <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
                    Sending…
                  </>
                ) : unavailable ? (
                  "Not available right now"
                ) : (
                  <>
                    <SparklesIcon className="size-5" aria-hidden />
                    Create account
                  </>
                )}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheckIcon className="size-3.5 text-primary" aria-hidden />
                Your password and keys are shown once and never stored.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
