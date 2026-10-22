"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (error) {
      // If MFA is required, Supabase returns aal1 session — challenge next.
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (totp) {
        const { data: ch } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        setFactorId(ch?.id ?? totp.id);
        setMfaNeeded(true);
        setLoading(false);
        return;
      }
      setError(error.message);
      setLoading(false);
      return;
    }
    // Non-allowlisted users are signed back out immediately.
    router.push("/overview");
    router.refresh();
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.verify({
      factorId: (await supabase.auth.mfa.listFactors()).data?.totp?.[0]?.id ?? "",
      challengeId: factorId,
      code,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/overview");
    router.refresh();
  }

  if (mfaNeeded) {
    return (
      <form onSubmit={verifyMfa} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="code">Authenticator code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            required
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button disabled={loading}>Verify</Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
      <p className="text-xs text-muted-foreground">
        No public signup. Access is by invitation only.
      </p>
    </form>
  );
}
