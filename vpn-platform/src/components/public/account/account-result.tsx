"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  KeyRoundIcon,
  Link2Icon,
  NetworkIcon,
  PlusIcon,
  TerminalIcon,
  TimerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/public/flag";
import { cn } from "@/lib/utils";
import type { PublicAccountResult } from "@/lib/public/types";
import { accountText, GROUP_TITLES, groupItems, resultItems, type GroupKey, type ResultItem } from "./account-sections";
import { downloadText, safeFilename } from "./browser-actions";
import { CopyAction } from "./copy-action";
import { QrDialog } from "./qr-dialog";
import { ExpiryCountdown, formatLocalDateTime, formatUtcDateTime, LocalDateTime, useExpired } from "./time";

/**
 * The one-time account result, shown in place of the form as a "profile card": DiceBear avatar,
 * username, protocol and server, live expiry countdown, then every connection detail with copy
 * buttons, QR codes and downloads. The data lives only in memory and is never sent anywhere.
 */

const GROUP_ICONS: Record<GroupKey, React.ReactNode> = {
  credentials: <KeyRoundIcon />,
  connection: <NetworkIcon />,
  links: <Link2Icon />,
  config: <TerminalIcon />,
  files: <FileTextIcon />,
};

function RevealButton({ revealed, onToggle, label }: { revealed: boolean; onToggle: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-9"
      aria-pressed={revealed}
      aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
      title={revealed ? "Hide" : "Show"}
      onClick={onToggle}
    >
      {revealed ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
    </Button>
  );
}

function ItemRow({ item, filenameBase }: { item: ResultItem; filenameBase: string }) {
  const maskable = item.sensitive || item.kind === "secret";
  const [revealed, setRevealed] = useState(!maskable);
  const hidden = maskable && !revealed;
  const actions = (
    <div className="flex shrink-0 items-center gap-0.5">
      {maskable && item.kind !== "file" ? <RevealButton revealed={revealed} onToggle={() => setRevealed((v) => !v)} label={item.label} /> : null}
      {item.qr ? <QrDialog value={item.value} title={item.label} filename={`${filenameBase}-${item.label}`} /> : null}
      {item.copyable ? <CopyAction value={item.value} label={`Copy ${item.label}`} /> : null}
    </div>
  );

  if (item.kind === "file") {
    const filename = safeFilename(item.filename ?? `${filenameBase}-${item.label}.txt`);
    const size = new Blob([item.value]).size;
    return (
      <li className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/50 px-3 py-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <FileTextIcon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.label}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {filename} · {size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {item.qr ? <QrDialog value={item.value} title={item.label} filename={filename} /> : null}
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => downloadText(item.value, filename, item.mimeType)}>
            <DownloadIcon aria-hidden />
            Download
          </Button>
        </div>
      </li>
    );
  }

  if (item.kind === "multiline" || item.kind === "uri") {
    return (
      <li className="rounded-xl border bg-background/50">
        <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
          <span className="text-sm font-medium">{item.label}</span>
          {actions}
        </div>
        <div className="relative border-t">
          <pre
            className={cn(
              "max-h-56 overflow-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap",
              hidden && "pointer-events-none blur-[5px] select-none",
            )}
            aria-hidden={hidden || undefined}
          >
            {item.value}
          </pre>
          {hidden ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 shadow-sm">
                <EyeIcon className="size-4" aria-hidden />
                Tap to reveal
              </span>
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border bg-background/50 py-1 pr-1 pl-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
      <span className="col-span-2 pt-1.5 text-xs text-muted-foreground sm:col-span-1 sm:pt-0 sm:text-sm">{item.label}</span>
      <span className={cn("min-w-0 py-1 font-mono text-sm break-all", hidden && "tracking-widest text-muted-foreground")}>
        {hidden ? "••••••••••••" : item.value}
        {hidden ? <span className="sr-only"> (hidden)</span> : null}
      </span>
      {actions}
    </li>
  );
}

function Section({ groupKey, items, filenameBase }: { groupKey: GroupKey; items: ResultItem[]; filenameBase: string }) {
  const meta = GROUP_TITLES[groupKey];
  const headingId = `result-${groupKey}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-primary [&_svg]:size-4" aria-hidden>
          {GROUP_ICONS[groupKey]}
        </span>
        <div>
          <h3 id={headingId} className="text-sm font-semibold">
            {meta.title}
          </h3>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {items.map((it) => (
          <ItemRow key={it.id} item={it} filenameBase={filenameBase} />
        ))}
      </ul>
    </section>
  );
}

export function AccountResult({
  account,
  siteName,
  countryCode,
  countryName,
  guideHref,
  onCreateAnother,
}: {
  account: PublicAccountResult;
  siteName: string;
  countryCode: string;
  countryName: string;
  guideHref: string;
  onCreateAnother: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => resultItems(account), [account]);
  const groups = useMemo(() => groupItems(items), [items]);
  const expired = useExpired(account.expiresAt);
  const filenameBase = safeFilename(`${siteName}-${account.protocol.slug}-${account.username ?? "account"}`.toLowerCase(), "account");
  const avatarOk = typeof account.avatar === "string" && account.avatar.startsWith("data:image/");

  // Move focus to the result so keyboard and screen reader users land on it.
  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.focus({ preventScroll: true });
    el.closest("[data-result-card]")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  const text = (withFiles: boolean) =>
    accountText(account, { siteName, expiresLabel: formatLocalDateTime(account.expiresAt) || formatUtcDateTime(account.expiresAt), withFiles });

  return (
    <div data-result-card className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      <div className="relative overflow-hidden px-5 pt-6 pb-5 sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_28%,transparent),transparent)]"
        />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
          <div className="relative shrink-0">
            {avatarOk ? (
              // eslint-disable-next-line @next/next/no-img-element -- server-generated DiceBear SVG data URI
              <img
                src={account.avatar}
                alt=""
                width={84}
                height={84}
                draggable={false}
                className="size-21 rounded-2xl bg-[color-mix(in_oklch,var(--primary)_14%,white)] shadow-md ring-4 ring-card animate-in zoom-in-75 duration-500 motion-reduce:animate-none"
              />
            ) : (
              <span className="flex size-21 items-center justify-center rounded-2xl bg-muted ring-4 ring-card" />
            )}
            <span className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full bg-success text-white ring-4 ring-card">
              <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-primary uppercase">Account ready</p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 truncate font-mono text-2xl font-semibold tracking-tight outline-none">
              {account.username ?? `${account.protocol.name} account`}
            </h2>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground sm:justify-start">
              <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">{account.protocol.name}</span>
              <span className="inline-flex items-center gap-1.5">
                <Flag code={countryCode} className="h-3 w-4" title={countryName} />
                {account.server.name}
              </span>
            </p>
          </div>
          <div className="w-full shrink-0 rounded-xl border bg-background/70 px-4 py-3 text-left backdrop-blur sm:w-auto sm:min-w-52">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TimerIcon className="size-3.5" aria-hidden />
              {expired ? "Expired" : "Expires"}
            </p>
            <p className="mt-0.5 text-sm font-medium">
              <LocalDateTime iso={account.expiresAt} />
            </p>
            {expired ? (
              <p className="text-xs font-medium text-destructive">This account has expired.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                <ExpiryCountdown iso={account.expiresAt} className="font-medium text-foreground" />
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 sm:mx-6" role="note">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">Shown only once — save it now</p>
          <p className="text-muted-foreground">
            We don&apos;t keep a copy of your password, keys or links. Copy them, download the .txt file or scan the QR codes before you leave
            this page.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
        <CopyAction value={() => text(false)} label="Copy all details" variant="outline" size="default" successMessage="All details copied" className="h-10">
          Copy all
        </CopyAction>
        <Button type="button" variant="outline" className="h-10" onClick={() => downloadText(text(true), `${filenameBase}.txt`)}>
          <DownloadIcon aria-hidden />
          Save as .txt
        </Button>
        <Button asChild variant="ghost" className="h-10">
          <Link href={guideHref}>
            <BookOpenIcon aria-hidden />
            How to connect
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6">
        {groups.map((g) => (
          <Section key={g.key} groupKey={g.key} items={g.items} filenameBase={filenameBase} />
        ))}
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">The server didn&apos;t return any connection details.</p> : null}
      </div>

      <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-muted-foreground">Saved to My accounts on this device (without any secrets).</p>
        <Button type="button" variant="secondary" className="h-10" onClick={onCreateAnother}>
          <PlusIcon aria-hidden />
          Create another account
        </Button>
      </div>
    </div>
  );
}
