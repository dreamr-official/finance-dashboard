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
import { ACCOUNT_TYPE_LABELS, sortAccountsByClass } from "@/lib/account-types";


export default async function AccountsPage() {
  const [{ accounts, institutions }, user] = await Promise.all([
    getDataset(),
    getSessionUser(),
  ]);
  const isAdmin = user?.role === "admin";
  const institutionNames = new Map(institutions.map((institution) => [institution.id, institution.name]));
  const accountGroups = new Map<string, { institutionId: string; accounts: typeof accounts }>();
  for (const account of sortAccountsByClass(accounts, institutionNames)) {
    const key = `${account.assetClass}:${account.institutionId}`;
    const group = accountGroups.get(key) ?? {
      institutionId: account.institutionId,
      accounts: [],
    };
    group.accounts.push(account);
    accountGroups.set(key, group);
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
      {[...accountGroups.entries()].map(([key, { institutionId: instId, accounts: accts }]) => {
        const inst = institutions.find((i) => i.id === instId);
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-base">
                <span className="truncate">{inst?.name ?? (isAdmin ? "Manual" : "Accounts")}</span>
                {(isAdmin || inst?.provider !== "manual") && (
                  <Badge variant="outline" className="shrink-0">
                    {inst?.provider}
                  </Badge>
                )}
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
                        <div className="text-xs text-muted-foreground">
                          {ACCOUNT_TYPE_LABELS[a.type]}
                          {a.mask ? ` ····${a.mask}` : ""}
                          {isAdmin && a.isManual ? " · manual" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isAdmin && a.isManual && <ImportCsvDialog account={a} />}
                        <div className="text-right">
                          <div className="text-sm font-medium tabular-nums">
                            {a.assetClass === "liability"
                              ? `Owe ${fmtCurrency(Math.abs(a.currentBalance))}`
                              : fmtCurrency(a.currentBalance)}
                          </div>
                          {isAdmin && (
                            <div className="text-xs text-muted-foreground">
                              {a.isManual
                                ? "Manual"
                                : a.connectionStatus === "healthy"
                              ? "connected"
                              : a.connectionStatus === "needs_reauth"
                                ? "reconnect needed"
                                : a.connectionStatus}
                            </div>
                          )}
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
