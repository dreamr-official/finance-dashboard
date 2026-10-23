"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Landmark } from "lucide-react";

export function ConnectBankButton() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const openWhenReady = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) {
        setError("Plaid did not return a public token.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/integrations/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution
              ? {
                  name: metadata.institution.name,
                  institution_id: metadata.institution.institution_id,
                }
              : null,
            accounts: metadata.accounts.map((account) => ({
              mask: account.mask ?? null,
              name: account.name,
            })),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not connect bank.");
        if (result.warning) setError(`Connected, but initial sync failed: ${result.warning}`);
        router.refresh();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not connect bank.");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });

  useEffect(() => {
    if (ready && openWhenReady.current) {
      open();
      openWhenReady.current = false;
    }
  }, [open, ready, token]);

  async function connect() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/plaid/link-token", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start Plaid Link.");
      openWhenReady.current = true;
      setToken(result.linkToken);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start Plaid Link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      <Button size="sm" variant="outline" onClick={connect} disabled={loading}>
        <Landmark className="mr-1 h-4 w-4" />
        {loading ? "Connecting…" : "Connect bank"}
      </Button>
      {error && <p className="mt-1 max-w-64 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SyncNowButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sync() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sync failed.");
      const failures = result.results.filter((item: { error?: string }) => item.error);
      setMessage(
        failures.length
          ? `${failures.length} connection${failures.length === 1 ? "" : "s"} need attention.`
          : "Sync complete.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      <Button size="sm" variant="outline" onClick={sync} disabled={loading}>
        <RefreshCw className="mr-1 h-4 w-4" />
        {loading ? "Syncing…" : "Sync now"}
      </Button>
      {message && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
