"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";
import { setReportStatusAction } from "./actions";

const NOTE_MAX = 500;

/** Resolve / Reopen button with a dialog for an optional internal note. */
export function ReportStatusButton({
  id,
  status,
  note,
  summary,
  className,
}: {
  id: string;
  status: "open" | "resolved";
  /** Current admin note (pre-filled so it can be edited). */
  note: string | null;
  /** Short description of the report for the dialog, e.g. "Can't connect · Germany 1". */
  summary: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const resolving = status === "open";

  function submit() {
    start(async () => {
      const r = await setReportStatusAction(id, resolving ? "resolved" : "open", text);
      if (r.error) {
        setError(r.fieldErrors?.note?.[0]);
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={resolving ? "outline" : "ghost"}
        className={className}
        onClick={() => {
          setText(note ?? "");
          setError(undefined);
          setOpen(true);
        }}
      >
        {resolving ? <CheckCircle2Icon className="text-success" /> : <RotateCcwIcon />}
        {resolving ? "Resolve" : "Reopen"}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resolving ? "Mark report as resolved" : "Reopen report"}</DialogTitle>
            <DialogDescription>
              {summary}.{" "}
              {resolving
                ? "Add a note for other administrators about what was done. The reporter is not notified automatically."
                : "The report goes back to the open inbox and counts toward the badge again."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FormField
              id={`note-${id}`}
              label="Internal note"
              optional
              errors={error ? [error] : undefined}
              hint={
                <span className="flex justify-between gap-3">
                  <span>Visible to administrators only.</span>
                  <span className={cn("tabular-nums", text.length > NOTE_MAX && "text-destructive")}>
                    {text.length}/{NOTE_MAX}
                  </span>
                </span>
              }
            >
              <Textarea
                id={`note-${id}`}
                rows={3}
                value={text}
                maxLength={NOTE_MAX + 50}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(undefined);
                }}
                placeholder={resolving ? "e.g. Restarted the VLESS service; connections work again." : "Why it needs another look"}
                aria-invalid={!!error}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || text.length > NOTE_MAX}>
                {pending ? <LoaderCircleIcon className="animate-spin" /> : resolving ? <CheckCircle2Icon /> : <RotateCcwIcon />}
                {resolving ? "Mark resolved" : "Reopen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
