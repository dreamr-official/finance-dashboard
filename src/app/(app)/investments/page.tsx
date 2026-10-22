import { getDataset } from "@/lib/data/provider";
import { rothContributions, DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import { fmtCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";


const TAX_YEAR = new Date().getFullYear();

export default async function InvestmentsPage() {
  const { accounts, transactions, holdings } = await getDataset();
  const investAccounts = accounts.filter(
    (a) => a.assetClass === "investment" || a.assetClass === "retirement",
  );
  const investAccountIds = new Set(investAccounts.map((a) => a.id));
  const contributions = transactions.filter(
    (transaction) => transaction.type === "deposit" && investAccountIds.has(transaction.accountId),
  );
  const thisYearContributions = contributions
    .filter((transaction) => transaction.date.startsWith(String(TAX_YEAR)))
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const allTimeContributions = contributions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const contributionByAccount = investAccounts
    .map((account) => ({
      account,
      amount: contributions
        .filter((transaction) => transaction.accountId === account.id)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  const maxContribution = contributionByAccount[0]?.amount ?? 0;
  const stats = investAccounts.map((account) => {
    const accountTransactions = transactions.filter(
      (transaction) => transaction.accountId === account.id,
    );
    const deposits = accountTransactions
      .filter((transaction) => transaction.type === "deposit")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const withdrawals = accountTransactions
      .filter((transaction) => transaction.type === "withdrawal")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    return {
      account,
      currentValue: account.currentBalance,
      totalDeposits: deposits,
      netContributions: deposits - withdrawals,
      contributionLog: accountTransactions
        .filter(
          (transaction) =>
            transaction.type === "deposit" || transaction.type === "withdrawal",
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    };
  });
  const roth = rothContributions(accounts, transactions, TAX_YEAR);
  const rothLimit = DEFAULT_ROTH_LIMITS[TAX_YEAR];
  const rothPct = rothLimit ? Math.min(100, (roth.net / rothLimit) * 100) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-muted-foreground">
              Contributed this year
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {fmtCurrency(thisYearContributions, { decimals: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm text-muted-foreground">Contributed all-time</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {fmtCurrency(allTimeContributions, { decimals: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where your contributions went</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contributionByAccount.map(({ account, amount }) => (
              <div
                key={account.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{account.name}</div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${maxContribution ? (amount / maxContribution) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-sm tabular-nums">{fmtCurrency(amount, { decimals: 0 })}</div>
              </div>
            ))}
            {!contributionByAccount.length && (
              <p className="text-sm text-muted-foreground">No investment accounts yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            Roth IRA contributions — {TAX_YEAR}
            <span className="text-sm font-normal text-muted-foreground">
              limit configurable in Settings
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="tabular-nums font-medium">
              {fmtCurrency(roth.net, { decimals: 0 })}
              {rothLimit ? ` of ${fmtCurrency(rothLimit, { decimals: 0 })}` : ""}
            </span>
            {rothLimit && (
              <span className="text-muted-foreground">
                {fmtCurrency(rothLimit - roth.net, { decimals: 0 })} remaining
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${rothPct ?? 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((s) => {
          const acct = s.account;
          return (
            <Card key={acct.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <Link href={`/accounts/${acct.id}`} className="min-w-0 truncate hover:underline">
                    {acct.name}
                  </Link>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-normal text-muted-foreground">
                      Current value
                    </span>
                    <span className="tabular-nums">{fmtCurrency(s.currentValue)}</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Total deposited</div>
                    <div className="tabular-nums font-medium">
                      {fmtCurrency(s.totalDeposits, { decimals: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Net contributions</div>
                    <div className="tabular-nums font-medium">
                      {fmtCurrency(s.netContributions, { decimals: 0 })}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Contribution log
                  </div>
                  {s.contributionLog.length ? (
                    s.contributionLog.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {transaction.date} · {transaction.type}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {fmtCurrency(transaction.amount, { sign: true })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No deposits or withdrawals yet.</p>
                  )}
                </div>
                {holdings.filter((h) => h.accountId === acct.id).length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdings
                        .filter((h) => h.accountId === acct.id)
                        .map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>
                              <div className="font-medium">{h.symbol}</div>
                              <div className="text-xs text-muted-foreground">{h.name}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {h.quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtCurrency(h.value, { decimals: 0 })}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Deposits count only money in from outside. Buys, sells, dividends, and
        transfers between your own accounts never count as contributions.
      </p>
    </div>
  );
}
