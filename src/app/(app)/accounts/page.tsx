import { getDataset } from "@/lib/data/provider";
import { getSessionUser } from "@/lib/auth";
import { fmtCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddAccountDialog, ImportCsvDialog } from "./account-tools";
import Link from "next/link";
import { isDemoMode, isPlaidConfigured } from "@/lib/env";
import { ConnectBankButton, SyncNowButton } from "./plaid-connect";
import { TransferButton } from "./transfer-dialog";


export default async function AccountsPage() {
  const [{ accounts, institutions }, user] = await Promise.all([
    getDataset(),
    getSessionUser(),
  ]);
  const isAdmin = user?.role === "admin";
  const byInst = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const arr = byInst.get(a.institutionId) ?? [];
    arr.push(a);
    byInst.set(a.institutionId, arr);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 1 && accounts.some((account) => account.isManual) && (
              <TransferButton accounts={accounts} />
            )}
            <AddAccountDialog />
            {isPlaidConfigured() && !isDemoMode() && (
              <>
                <ConnectBankButton />
                <SyncNowButton />
              </>
            )}
          </div>
        )}
      </div>
      {[...byInst.entries()].map(([instId, accts]) => {
        const inst = institutions.find((i) => i.id === instId);
        return (
          <Card key={instId}>
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-base">
                <span className="truncate">{inst?.name ?? "Manual"}</span>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {inst?.provider}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {accts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/accounts/${a.id}`}
                      className="flex items-center justify-between px-6 py-3 hover:bg-accent/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {a.type.replace("_", " ")}
                          {a.mask ? ` ····${a.mask}` : ""}
                          {a.isManual ? " · manual" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isAdmin && a.isManual && <ImportCsvDialog account={a} />}
                        <div className="text-right">
                          <div className="text-sm font-medium tabular-nums">
                            {fmtCurrency(a.currentBalance)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.connectionStatus === "healthy"
                              ? "connected"
                              : a.connectionStatus === "needs_reauth"
                                ? "reconnect needed"
                                : a.connectionStatus}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
