"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ initialMfaRequired = false }: { initialMfaRequired?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaNeeded, setMfaNeeded] = useState(initialMfaRequired);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!mfaNeeded || factorId) return;
    let active = true;
    async function loadFactor() {
      try {
        const { data, error: factorError } = await createClient().auth.mfa.listFactors();
        if (!active) return;
        if (factorError) {
          setError(factorError.message);
          return;
        }
        const factor = data?.totp.find((item) => item.status === "verified");
        if (!factor) {
          setError("No verified authenticator factor is available.");
          return;
        }
        setFactorId(factor.id);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load authenticator.");
        }
      }
    }
    void loadFactor();
    return () => {
      active = false;
    };
  }, [factorId, mfaNeeded]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: String(fd.get("email")),
        password: String(fd.get("password")),
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) {
        setError(assuranceError.message);
        return;
      }
      if (
        assurance.nextLevel === "aal2" &&
        assurance.currentLevel !== "aal2"
      ) {
        setMfaNeeded(true);
        return;
      }
      router.push("/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in request failed");
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError(null);
    try {
      const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      router.push("/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authenticator verification failed.");
    } finally {
      setLoading(false);
    }
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
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={loading || !factorId}>
          {loading ? "Verifying…" : "Verify"}
        </Button>
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
      <Button type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        No public signup. Access is by invitation only.
      </p>
    </form>
  );
}
