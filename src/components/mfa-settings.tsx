"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MfaFactor {
  id: string;
  factor_type: string;
  status: string;
}

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function MfaSettings() {
  const router = useRouter();
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshFactors() {
    const { data, error } = await createClient().auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.all);
  }

  useEffect(() => {
    let active = true;
    void createClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMessage(error.message);
          return;
        }
        setFactors(data.all);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Could not load 2-step login.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const verifiedFactors = factors.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );

  async function setup() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: current, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of current.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (error) throw error;
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      if (data.type !== "totp") throw new Error("Could not enroll an authenticator.");
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not set up 2-step login.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      });
      if (error) throw error;
      setEnrollment(null);
      setCode("");
      await refreshFactors();
      setMessage("2-step login is on.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify authenticator.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!verifiedFactors.length) return;
    if (!window.confirm("Turn off 2-step login for this account?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      for (const factor of verifiedFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      await refreshFactors();
      setMessage("2-step login is off.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn off 2-step login.");
    } finally {
      setBusy(false);
    }
  }

  const qrSrc = enrollment?.qrCode.startsWith("data:")
    ? enrollment.qrCode
    : enrollment
      ? `data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`
      : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Status: <span className="font-medium">{verifiedFactors.length ? "On" : "Off"}</span>
        </p>
        {verifiedFactors.length ? (
          <Button type="button" variant="outline" size="sm" onClick={turnOff} disabled={busy}>
            Turn off
          </Button>
        ) : !enrollment ? (
          <Button type="button" variant="outline" size="sm" onClick={setup} disabled={busy}>
            {busy ? "Setting up…" : "Set up"}
          </Button>
        ) : null}
      </div>
      {enrollment && (
        <div className="space-y-3">
          <Image
            className="h-40 w-40 rounded-md border p-2"
            src={qrSrc}
            alt="Authenticator QR code"
            width={160}
            height={160}
            unoptimized
          />
          <p className="break-all text-xs text-muted-foreground">
            Secret: <code>{enrollment.secret}</code>
          </p>
          <form onSubmit={verify} className="flex flex-col gap-2">
            <div>
              <Label htmlFor="mfa-code">Authenticator code</Label>
              <Input
                id="mfa-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify and enable"}
            </Button>
          </form>
        </div>
      )}
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
