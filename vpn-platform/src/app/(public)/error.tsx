"use client";

import Link from "next/link";
import { ActivityIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { Container } from "@/components/public/section";
import { StatusMessage, pillOutline, pillPrimary } from "@/components/public/status-message";

/** Error boundary for public pages: the header and footer stay, the page offers a retry. */
export default function PublicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Container>
      <StatusMessage
        icon={<TriangleAlertIcon />}
        title="This page could not be loaded"
        description="Something went wrong on our side while loading the servers. It is usually temporary, so please try again in a moment."
      >
        <button type="button" onClick={() => retry()} className={pillPrimary}>
          <RotateCwIcon />
          Try again
        </button>
        <Link href="/server-status" className={pillOutline}>
          <ActivityIcon />
          Server status
        </Link>
      </StatusMessage>
      {error.digest ? <p className="-mt-12 pb-12 text-center font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
    </Container>
  );
}
