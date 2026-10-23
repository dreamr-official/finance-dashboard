import { getDataset } from "@/lib/data/provider";
import { rothContributions, DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import {
  capSlices,
  groupHoldingsByAssetType,
  groupHoldingsBySymbol,
  holdingsWithShare,
} from "@/lib/holdings";
import { fmtCompact, fmtCurrency, fmtShare } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContributionsChart } from "@/components/contributions-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import Link from "next/link";


export default async function InvestmentsPage() {
  const TAX_YEAR = new Date().getUTCFullYear();
  const { accounts, transactions, holdings } = await getDataset();
  const rothAccounts = accounts.filter((account) => account.type === "roth_ira");
  const investAccounts = accounts.filter(
    (a) => a.assetClass === "investment" || a.assetClass === "retirement",
  );
  const investAccountIds = new Set(investAccounts.map((a) => a.id));
  const investHoldings = holdings.filter((holding) => investAccountIds.has(holding.accountId));
  const symbolGroups = groupHoldingsBySymbol(
    investHoldings,
    new Map(accounts.map((account) => [account.id, account.name] as const)),
  );
  const assetTypeSlices = groupHoldingsByAssetType(investHoldings);
  const holdingTotal = symbolGroups.reduce((sum, holding) => sum + holding.value, 0);
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
  const contributionsByDate = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      !investAccountIds.has(transaction.accountId) ||
      (transaction.type !== "deposit" && transaction.type !== "withdrawal")
    ) {
      continue;
    }
    const amount =
      transaction.type === "deposit"
        ? Math.abs(transaction.amount)
        : -Math.abs(transaction.amount);
    contributionsByDate.set(
      transaction.date,
      (contributionsByDate.get(transaction.date) ?? 0) + amount,
    );
  }
  const contributionHistory = [...contributionsByDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<{ date: string; value: number }[]>((history, [date, amount]) => [
      ...history,
      {
        date,
        value: (history[history.length - 1]?.value ?? 0) + amount,
      },
    ], []);
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
  const rothPct = rothLimit
    ? Math.min(100, (roth.deposits / rothLimit) * 100)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] lg:gap-4">
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">
              Contributed this year
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {fmtCurrency(thisYearContributions, { decimals: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Contributed all-time</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {fmtCurrency(allTimeContributions, { decimals: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>All holdings</CardTitle>
            <CardDescription>
              Across {investAccounts.length} accounts ·{" "}
              {fmtCurrency(holdingTotal, { decimals: 0 })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {symbolGroups.length ? (
              <>
                <DonutChart
                  data={capSlices(symbolGroups)}
                  centerValue={fmtCompact(holdingTotal)}
                  centerLabel="Invested"
                />
                <div className="divide-y">
                  {symbolGroups.map((holding) => (
                    <div
                      key={holding.key}
                      className="flex min-w-0 items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-medium">{holding.symbol}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {holding.name}
                          </span>
                        </div>
                        {holding.accountIds.length > 1 && (
                          <div className="text-xs text-muted-foreground">
                            {holding.accountIds.length} accounts
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular-nums">{fmtCurrency(holding.value)}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {fmtShare(holding.pct)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No holdings yet — link via Plaid (Settings → Grant investment access) or add manually.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Allocation by type</CardTitle>
          </CardHeader>
          <CardContent>
            {assetTypeSlices.length ? (
              <DonutChart
                data={assetTypeSlices}
                centerValue={fmtCompact(holdingTotal)}
                centerLabel="Invested"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No holdings yet — link via Plaid (Settings → Grant investment access) or add manually.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contributions over time</CardTitle>
        </CardHeader>
        <CardContent>
          {contributionHistory.length ? (
            <ContributionsChart data={contributionHistory} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No deposits or withdrawals to chart yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            Roth IRA contributions — {TAX_YEAR}
            <span className="text-sm font-normal text-muted-foreground">
              IRS limit
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="tabular-nums font-medium">
              {fmtCurrency(roth.deposits, { decimals: 0 })}
              {rothLimit ? ` of ${fmtCurrency(rothLimit, { decimals: 0 })}` : ""}
            </span>
            {rothLimit && (
              <span className="text-muted-foreground">
                {fmtCurrency(Math.max(0, rothLimit - roth.deposits), { decimals: 0 })} remaining
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${rothPct ?? 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Withdrawals this year: {fmtCurrency(roth.withdrawals, { decimals: 0 })}
          </p>
          {!rothAccounts.length ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No account is marked as a Roth IRA — open the account and set its type to Roth IRA.
            </p>
          ) : (
            roth.deposits === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No contributions found for {TAX_YEAR}. If a contribution shows as a transfer or
                other, open the account and change that transaction&apos;s type to Deposit.
              </p>
            )
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((s) => {
          const acct = s.account;
          const accountHoldings = holdingsWithShare(
            holdings.filter((holding) => holding.accountId === acct.id),
          );
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
                {accountHoldings.length > 0 && (
                  <div className="divide-y">
                    {accountHoldings.map((holding) => (
                      <div
                        key={holding.id}
                        className="flex min-w-0 items-center justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{holding.symbol}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {holding.name}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="tabular-nums">
                            {fmtCurrency(holding.value, { decimals: 0 })}
                          </div>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {fmtShare(holding.pct)} of account
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
