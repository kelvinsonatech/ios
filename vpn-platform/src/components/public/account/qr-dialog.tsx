"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { dataUrlToBlob, downloadBlob, safeFilename } from "./browser-actions";

type QrState = { status: "loading" } | { status: "ready"; dataUrl: string } | { status: "error"; message: string };

/** Renders `value` as a QR code in the browser (qrcode package, loaded on demand). */
function QrImage({ value, title, filename }: { value: string; title: string; filename: string }) {
  const [state, setState] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(value, { errorCorrectionLevel: "M", margin: 2, width: 640, color: { dark: "#0b1220", light: "#ffffff" } }))
      .then((dataUrl) => {
        if (!cancelled) setState({ status: "ready", dataUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "This value is too long for a QR code. Copy it or download the file instead." });
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (state.status === "error") return <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{state.message}</p>;
  return (
    <div className="grid justify-items-center gap-4">
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        {state.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data: URI
          <img src={state.dataUrl} alt={`QR code for ${title}`} width={280} height={280} className="size-[min(70vw,280px)]" />
        ) : (
          <Skeleton className="size-[min(70vw,280px)] bg-slate-100" />
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={state.status !== "ready"}
        onClick={() => {
          if (state.status === "ready") downloadBlob(dataUrlToBlob(state.dataUrl), `${safeFilename(filename, "qr-code")}.png`);
        }}
      >
        <DownloadIcon aria-hidden />
        Save PNG
      </Button>
    </div>
  );
}

export function QrDialog({ value, title, filename, trigger }: { value: string; title: string; filename: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon-sm" className="size-9" aria-label={`Show QR code for ${title}`} title="QR code">
            <QrCodeIcon aria-hidden />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Scan with your VPN app to import this connection. Keep it private: it contains your credentials.</DialogDescription>
        </DialogHeader>
        {open ? <QrImage value={value} title={title} filename={filename} /> : null}
      </DialogContent>
    </Dialog>
  );
}
