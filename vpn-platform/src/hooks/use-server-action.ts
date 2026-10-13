"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/action-state";

/**
 * Submit a form to a Server Action without React's automatic form reset, so typed values survive
 * validation errors. Shows a toast for `message` / `error` unless `toasts: false`.
 */
export function useServerAction(action: (fd: FormData) => Promise<ActionState>, opts: { toasts?: boolean } = {}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (fd: FormData) =>
      new Promise<ActionState>((resolve) => {
        startTransition(async () => {
          const result = (await action(fd)) ?? {};
          setState(result);
          if (result.error && opts.toasts !== false) toast.error(result.error);
          else if (result.message && opts.toasts !== false) toast.success(result.message);
          resolve(result);
        });
      }),
    [action, opts.toasts],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void run(new FormData(e.currentTarget));
    },
    [run],
  );

  return { state, pending, onSubmit, run, setState };
}
