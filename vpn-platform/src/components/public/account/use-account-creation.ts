"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountStatusResponse, CreateAccountRequest, CreateAccountResponse, PublicAccountResult } from "@/lib/public/types";
import { ApiError, isAbortError, requestJson } from "./api";
import { friendlyError, type FriendlyError } from "./errors";
import { newIdempotencyKey } from "./form-validation";

/**
 * Account creation flow: POST /api/public/accounts, then poll GET /api/public/accounts/{id} with
 * the claim token until the account is ready. { requestId, claimToken } is kept in sessionStorage
 * (this tab only) so a reload during or right after creation recovers the one-time result; it is
 * cleared when the visitor starts over. The result itself is only ever held in memory.
 */
export type CreationState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "pending"; requestId: string; step: "received" | "creating"; connectionIssue: boolean }
  | { phase: "timeout"; requestId: string }
  | { phase: "result"; requestId: string; account: PublicAccountResult; createdAt: string }
  | { phase: "expired" }
  | { phase: "failed"; error: FriendlyError };

interface PendingCreation {
  requestId: string;
  claimToken: string;
  createdAt: string;
}

const POLL_START_MS = 1000;
const POLL_MAX_MS = 3000;
const POLL_GIVE_UP_MS = 120_000;

export function pendingStorageKey(protocolSlug: string, serverId: string) {
  return `vl:create:${protocolSlug}:${serverId}`;
}

function readPending(key: string): PendingCreation | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PendingCreation>;
    if (
      typeof o.requestId === "string" &&
      /^[A-Za-z0-9-]{8,64}$/.test(o.requestId) &&
      typeof o.claimToken === "string" &&
      /^[A-Za-z0-9_-]{16,256}$/.test(o.claimToken) &&
      typeof o.createdAt === "string" &&
      !Number.isNaN(Date.parse(o.createdAt))
    ) {
      return { requestId: o.requestId, claimToken: o.claimToken, createdAt: o.createdAt };
    }
  } catch {
    // Corrupted or blocked storage: start fresh.
  }
  return null;
}

function writePending(key: string, p: PendingCreation) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(p));
  } catch {
    // Storage disabled: recovery after reload just isn't available.
  }
}

function clearPending(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface CreationOptions {
  serverId: string;
  protocolSlug: string;
  protocolName: string;
  serverName: string;
  /** Called once per recovered or new result (save a summary, refresh slot counts...). */
  onReady?: (requestId: string, account: PublicAccountResult, createdAt: string) => void;
}

export function useAccountCreation(options: CreationOptions) {
  const [state, setState] = useState<CreationState>({ phase: "idle" });
  const [formError, setFormError] = useState<FriendlyError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>(undefined);

  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });
  const storageKey = pendingStorageKey(options.protocolSlug, options.serverId);

  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  /** Reused for a resubmission of identical input after an unanswered request (the server may have it). */
  const keyRef = useRef<{ key: string; fingerprint: string } | null>(null);

  const stop = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const poll = useCallback(
    async (pending: PendingCreation, key: string) => {
      stop();
      const run = runRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      const started = Date.now();
      let delay = POLL_START_MS;
      let failures = 0;

      while (run === runRef.current) {
        if (!(await sleep(delay, ac.signal))) return;
        try {
          const { data } = await requestJson<AccountStatusResponse>(`/api/public/accounts/${encodeURIComponent(pending.requestId)}`, {
            headers: { "x-claim-token": pending.claimToken },
            signal: ac.signal,
          });
          if (run !== runRef.current) return;
          failures = 0;
          if (data.status === "active") {
            if (data.account) {
              setState({ phase: "result", requestId: pending.requestId, account: data.account, createdAt: pending.createdAt });
              optsRef.current.onReady?.(pending.requestId, data.account, pending.createdAt);
            } else {
              clearPending(key);
              setState({ phase: "expired" });
            }
            return;
          }
          if (data.status === "failed") {
            clearPending(key);
            const message = data.error?.message?.trim() || "The server couldn't create the account.";
            setState({
              phase: "failed",
              error: { code: data.error?.code ?? "FAILED", title: "We couldn't create your account", message, suggestOtherServer: true },
            });
            return;
          }
          setState({ phase: "pending", requestId: pending.requestId, step: "creating", connectionIssue: false });
        } catch (err) {
          if (isAbortError(err) || run !== runRef.current) return;
          if (err instanceof ApiError && (err.status === 404 || err.status === 403 || err.status === 400)) {
            clearPending(key);
            setState({
              phase: "failed",
              error: { code: err.code, title: "This request can't be found", message: "It may have expired. Please create the account again." },
            });
            return;
          }
          if (err instanceof ApiError && err.status === 429) {
            delay = Math.max(delay, Math.min((err.details.retryAfterSeconds ?? 5) * 1000, 30_000));
          }
          failures++;
          if (failures >= 2) {
            setState({ phase: "pending", requestId: pending.requestId, step: "creating", connectionIssue: true });
          }
        }
        if (Date.now() - started > POLL_GIVE_UP_MS) {
          setState({ phase: "timeout", requestId: pending.requestId });
          return;
        }
        delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.4));
      }
    },
    [stop],
  );

  // Recover an in-flight or just-finished creation after a reload (this tab only).
  useEffect(() => {
    const saved = readPending(storageKey);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (saved) {
      t = setTimeout(() => {
        setState({ phase: "pending", requestId: saved.requestId, step: "creating", connectionIssue: false });
        void poll(saved, storageKey);
      }, 0);
    }
    return () => {
      if (t) clearTimeout(t);
      stop();
    };
  }, [storageKey, poll, stop]);

  const submit = useCallback(
    async (input: Record<string, string>, captchaToken: string | null): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      const o = optsRef.current;
      setFormError(null);
      setFieldErrors(undefined);
      setState({ phase: "submitting" });

      const fingerprint = JSON.stringify(input);
      if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) keyRef.current = { key: newIdempotencyKey(), fingerprint };
      const body: CreateAccountRequest = {
        serverId: o.serverId,
        protocol: o.protocolSlug,
        input,
        idempotencyKey: keyRef.current.key,
        captchaToken: captchaToken ?? null,
      };
      try {
        const { data } = await requestJson<CreateAccountResponse>("/api/public/accounts", { method: "POST", body });
        keyRef.current = null;
        if (typeof data?.requestId !== "string" || typeof data?.claimToken !== "string") {
          throw new ApiError(500, "BAD_RESPONSE", "Unexpected response");
        }
        const pending: PendingCreation = { requestId: data.requestId, claimToken: data.claimToken, createdAt: new Date().toISOString() };
        const key = pendingStorageKey(o.protocolSlug, o.serverId);
        writePending(key, pending);
        setState({ phase: "pending", requestId: data.requestId, step: data.state === "queued" ? "received" : "creating", connectionIssue: false });
        void poll(pending, key);
        return true;
      } catch (err) {
        // A definitive answer means nothing was created: the next attempt gets a fresh key.
        if (err instanceof ApiError && err.status < 500) keyRef.current = null;
        setFormError(friendlyError(err, { protocolName: o.protocolName, serverName: o.serverName }));
        setFieldErrors(err instanceof ApiError ? err.details.fieldErrors : undefined);
        setState({ phase: "idle" });
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [poll],
  );

  /** Start over: forget the stored request and show an empty form. */
  const reset = useCallback(() => {
    stop();
    clearPending(storageKey);
    keyRef.current = null;
    setFormError(null);
    setFieldErrors(undefined);
    setState({ phase: "idle" });
  }, [stop, storageKey]);

  /** Keep waiting after the polling gave up. */
  const checkAgain = useCallback(() => {
    const saved = readPending(storageKey);
    if (!saved) {
      setState({ phase: "expired" });
      return;
    }
    setState({ phase: "pending", requestId: saved.requestId, step: "creating", connectionIssue: false });
    void poll(saved, storageKey);
  }, [poll, storageKey]);

  /** Back to the (still filled) form after a failure. */
  const backToForm = useCallback(() => setState({ phase: "idle" }), []);

  return { state, formError, fieldErrors, submit, reset, checkAgain, backToForm, clearFormError: () => setFormError(null) };
}
