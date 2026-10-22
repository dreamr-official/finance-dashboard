"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface PlaidConnection {
  id: string;
  institutionName: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
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
            </div>
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
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
