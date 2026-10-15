"use client";

import { useSyncExternalStore } from "react";
import type { SavedAccountSummary } from "@/lib/public/types";

/**
 * "My accounts": non-secret summaries of accounts created in this browser, kept only in
 * localStorage under "vl:my-accounts" (newest first, at most 50). Never passwords, UUIDs, keys,
 * links or configs. Every read is validated, so corrupted or tampered storage is ignored.
 *
 * Other components (e.g. a header badge) can use `useSavedAccounts()` or listen for
 * MY_ACCOUNTS_EVENT on window.
 */
export const MY_ACCOUNTS_KEY = "vl:my-accounts";
export const MY_ACCOUNTS_EVENT = "vl:my-accounts-change";
const MAX_ITEMS = 50;

const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isDate = (v: unknown): v is string => isStr(v, 64) && !Number.isNaN(Date.parse(v));

function isSummary(x: unknown): x is SavedAccountSummary {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const p = o.protocol as Record<string, unknown> | undefined;
  const s = o.server as Record<string, unknown> | undefined;
  return (
    isStr(o.id, 64) &&
    !!p &&
    isStr(p.slug, 64) &&
    isStr(p.name, 80) &&
    !!s &&
    isStr(s.name, 120) &&
    isStr(s.href, 200) &&
    /^\/(?!\/)[a-z0-9\-/]*$/.test(s.href) &&
    isStr(s.countryCode, 2) &&
    (o.username === null || isStr(o.username, 64)) &&
    isStr(o.avatar, 200_000) &&
    o.avatar.startsWith("data:image/svg+xml") &&
    isDate(o.createdAt) &&
    isDate(o.expiresAt)
  );
}

/** Copy only the known, non-secret properties (drops anything else that may have been stored). */
function pick(s: SavedAccountSummary): SavedAccountSummary {
  return {
    id: s.id,
    protocol: { slug: s.protocol.slug, name: s.protocol.name },
    server: { name: s.server.name, href: s.server.href, countryCode: s.server.countryCode },
    username: s.username,
    avatar: s.avatar,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  };
}

function parse(raw: string | null): SavedAccountSummary[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isSummary).map(pick).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(MY_ACCOUNTS_KEY);
  } catch {
    return null;
  }
}

function write(items: SavedAccountSummary[]) {
  try {
    if (items.length) window.localStorage.setItem(MY_ACCOUNTS_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    else window.localStorage.removeItem(MY_ACCOUNTS_KEY);
  } catch {
    // Storage full or disabled (private mode): the list simply isn't kept.
  }
  window.dispatchEvent(new Event(MY_ACCOUNTS_EVENT));
}

export function readSavedAccounts(): SavedAccountSummary[] {
  return parse(readRaw());
}

export function saveAccountSummary(summary: SavedAccountSummary) {
  if (!isSummary(summary)) return;
  const rest = readSavedAccounts().filter((s) => s.id !== summary.id);
  write([pick(summary), ...rest]);
}

export function removeSavedAccount(id: string) {
  write(readSavedAccounts().filter((s) => s.id !== id));
}

/** Removes several summaries at once (e.g. every expired one). */
export function removeSavedAccounts(ids: Iterable<string>) {
  const drop = new Set(ids);
  write(readSavedAccounts().filter((s) => !drop.has(s.id)));
}

/** Puts removed summaries back at their old positions ("Undo"). */
export function restoreSavedAccounts(entries: { summary: SavedAccountSummary; index: number }[]) {
  const items = readSavedAccounts();
  for (const { summary, index } of [...entries].sort((a, b) => a.index - b.index)) {
    if (!isSummary(summary) || items.some((s) => s.id === summary.id)) continue;
    items.splice(Math.max(0, Math.min(index, items.length)), 0, pick(summary));
  }
  write(items);
}

export function clearSavedAccounts() {
  write([]);
}

// --- React binding -----------------------------------------------------------------------------

let cachedRaw: string | null | undefined;
let cachedItems: SavedAccountSummary[] = [];

function snapshot(): SavedAccountSummary[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = parse(raw);
  }
  return cachedItems;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MY_ACCOUNTS_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(MY_ACCOUNTS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MY_ACCOUNTS_EVENT, onChange);
  };
}

const serverSnapshot = () => null;

/** Saved accounts (live across tabs); null on the server and during hydration. */
export function useSavedAccounts(): SavedAccountSummary[] | null {
  return useSyncExternalStore<SavedAccountSummary[] | null>(subscribe, snapshot, serverSnapshot);
}
