import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { readSessionCookie } from "@/server/auth/cookies";
import { validateSessionToken } from "@/server/auth/session";
import { logoutAction } from "../actions";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Two-factor authentication", robots: { index: false, follow: false } };

export default async function MfaPage() {
  const s = await validateSessionToken(await readSessionCookie());
  if (!s) redirect("/admin/login");
  if (!s.admin.mfaEnabled || s.session.mfaVerified) redirect("/admin");
  return (
    <Card>
      <CardHeader>
        <h1 data-slot="card-title" className="text-xl leading-none font-semibold">Two-factor authentication</h1>
        <CardDescription>Signed in as {s.admin.email}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <MfaForm />
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Use a different account
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
