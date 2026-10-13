import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readSessionCookie } from "@/server/auth/cookies";
import { validateSessionToken } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const s = await validateSessionToken(await readSessionCookie());
  if (s) redirect(s.admin.mfaEnabled && !s.session.mfaVerified ? "/admin/login/mfa" : "/admin");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Administrator access to servers, protocols and accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
