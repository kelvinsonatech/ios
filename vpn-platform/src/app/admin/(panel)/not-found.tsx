import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 404 inside the admin panel (unknown server, protocol or account id), keeping the admin navigation. */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchXIcon className="size-5 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">This item does not exist or was deleted.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/admin">Dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/servers">Servers</Link>
        </Button>
      </div>
    </div>
  );
}
