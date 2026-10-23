"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";

export interface PlaidConnection {
  id: string;
  institutionName: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  notice: string | null;
}

function GrantInvestmentAccessButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const openWhenReady = useRef(false);

  async function onSuccess() {
    setBusy(true);
    setMessage(null);
    try {
      const repaired = await fetch(
        `/api/integrations/plaid/${connectionId}/repaired`,
        { method: "POST" },
      );
      const repairedResult = await repaired.json();
      if (!repaired.ok) {
        throw new Error(repairedResult.error ?? "Could not restore the connection.");
      }
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sync failed.");
      setMessage("Investment access granted; sync complete.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => setBusy(false),
  });

  useEffect(() => {
    if (ready && openWhenReady.current) {
      open();
      openWhenReady.current = false;
    }
  }, [open, ready, token]);

  async function grantAccess() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/integrations/plaid/${connectionId}/link-token`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start Plaid Link.");
      openWhenReady.current = true;
      setToken(result.linkToken);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not start Plaid Link.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={grantAccess}
      >
        {busy ? "Opening…" : "Grant investment access"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

export function PlaidConnections({
  connections,
}: {
  connections: PlaidConnection[];
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(connection: PlaidConnection) {
    if (!confirm(`Remove ${connection.institutionName}? Account and transaction history will be kept.`)) {
      return;
    }
    setRemovingId(connection.id);
    setError(null);
    const response = await fetch(`/api/integrations/plaid/${connection.id}`, {
      method: "DELETE",
    });
    setRemovingId(null);
    if (!response.ok) {
      const result = await response.json();
      setError(typeof result.error === "string" ? result.error : "Could not remove connection.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {!connections.length && (
        <p className="text-sm text-muted-foreground">No Plaid connections yet.</p>
      )}
      {connections.map((connection) => (
        <div key={connection.id} className="min-w-0 rounded-md border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{connection.institutionName}</div>
              <div className="text-xs capitalize text-muted-foreground">
                {connection.status}
                {connection.lastSyncedAt
                  ? ` · last synced ${new Date(connection.lastSyncedAt).toLocaleString()}`
                  : " · not synced yet"}
              </div>
              {connection.lastError && (
                <div className="mt-1 break-words text-xs text-red-600">
                  {connection.lastError}
                </div>
              )}
              {connection.notice && (
                <div className="mt-1 break-words text-xs text-amber-700 dark:text-amber-400">
                  {connection.notice}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GrantInvestmentAccessButton connectionId={connection.id} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removingId === connection.id}
                onClick={() => remove(connection)}
              >
                {removingId === connection.id ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
