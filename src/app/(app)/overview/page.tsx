import { getDataset } from "@/lib/data/provider";
import { APP_TIMEZONE, appToday, shiftDate } from "@/lib/dates";
import {
  accountChanges,
  applyNetWorthChange,
  computeNetWorth,
  isLiability,
  netWorthSeries,
} from "@/lib/finance";
import { assetClassSlices } from "@/lib/holdings";
import { sortAccountsByClass } from "@/lib/account-types";
import { fmtCompact, fmtCurrency, fmtDate, fmtShare } from "@/lib/format";
import { NetWorthChart } from "@/components/net-worth-chart";
import { AccountChanges } from "@/components/account-changes";
import { StatCard } from "@/components/stat-card";
import { Delta } from "@/components/delta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/charts/donut-chart";
import { chartColor } from "@/components/charts/colors";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import {
  getUpcomingSubscriptions,
  isSubscriptionDatePredicted,
  getSubscriptionNextPaymentDate,
} from "@/lib/subscriptions";


export default async function OverviewPage() {
  const [{ accounts, institutions, snapshots, subscriptions, transactions }, user] =
    await Promise.all([getDataset(), getSessionUser()]);
  const isAdmin = user?.role === "admin";
  const todayDate = appToday();
  const today = new Date(`${todayDate}T12:00:00.000Z`);
  const upcomingSubscriptions = getUpcomingSubscriptions(subscriptions, today, 14);
  const cutoffDate = shiftDate(todayDate, -60);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const recentIncome = transactions
    .filter(
      (transaction) =>
        (transaction.type === "dividend" || transaction.type === "interest") &&
        transaction.amount > 0 &&
        transaction.date >= cutoffDate &&
        transaction.date <= todayDate,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const recentIncomeTotal = recentIncome.reduce((sum, transaction) => sum + transaction.amount, 0);
  const series = netWorthSeries(accounts, snapshots, todayDate);
  const summary = applyNetWorthChange(computeNetWorth(accounts), series);
  const instById = Object.fromEntries(institutions.map((i) => [i.id, i]));
  const liabilityAccounts = accounts.filter(isLiability);
  const assetSlices = assetClassSlices(accounts);
  const groups = [
    { key: "cash", label: "Cash" },
    { key: "investment", label: "Investments" },
    { key: "retirement", label: "Retirement" },
    { key: "other", label: "Other assets" },
  ].map((group) => ({
    ...group,
    amount: assetSlices.find((slice) => slice.key === group.key)?.value ?? 0,
  }));
  const maxAssetGroup = Math.max(...groups.map((group) => group.amount), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Total net worth</p>
        <h1 className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
          {fmtCurrency(summary.netWorth, { decimals: 0 })}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>1D <Delta value={summary.change.day} /></span>
          <span>1W <Delta value={summary.change.week} /></span>
          <span>1M <Delta value={summary.change.month} /></span>
          <span>1Y <Delta value={summary.change.year} /></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Assets" value={fmtCompact(summary.assets)} />
        <Link href="#liabilities" className="block">
          <StatCard
            title="Debt (cards & loans)"
            value={fmtCurrency(Math.abs(summary.liabilities), { decimals: 0 })}
          />
        </Link>
        <StatCard title="Cash" value={fmtCompact(summary.cash)} />
        <StatCard title="Invested (incl. retirement)" value={fmtCompact(summary.investments)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where your money sits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
            <div className="min-w-0">
              <DonutChart
                data={assetSlices}
                showLegend={false}
                centerValue={fmtCompact(summary.assets)}
                centerLabel="Assets"
              />
            </div>
            <div className="min-w-0 space-y-4">
              {groups
                .filter((group) => group.key !== "other" || group.amount !== 0)
                .map((group) => {
                const colorIndex = assetSlices.findIndex((slice) => slice.key === group.key);
                const color = colorIndex >= 0 ? chartColor(colorIndex).fill : undefined;
                return (
                  <div
                    key={group.label}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full bg-muted"
                            style={color ? { backgroundColor: color } : undefined}
                          />
                          <span className="truncate">{group.label}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {summary.assets > 0
                            ? fmtShare((group.amount / summary.assets) * 100)
                            : "0%"}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${maxAssetGroup > 0 ? (group.amount / maxAssetGroup) * 100 : 0}%`,
                            ...(color ? { backgroundColor: color } : {}),
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-medium tabular-nums">
                      {fmtCurrency(group.amount, { decimals: 0 })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div id="liabilities" className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">Debt</span>
            <span className="font-medium tabular-nums">
              {fmtCurrency(Math.abs(summary.liabilities), { decimals: 0 })}
            </span>
          </div>
          {liabilityAccounts.length ? (
            <ul className="divide-y">
              {liabilityAccounts.map((account) => (
                <li key={account.id}>
                  <Link
                    href={`/accounts/${account.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{account.name}</span>
                      {instById[account.institutionId]?.name && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {instById[account.institutionId]?.name}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                      Owe {fmtCurrency(Math.abs(account.currentBalance), { decimals: 2 })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing owed. Credit cards and loans appear here once linked or added.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Coming up</CardTitle>
              <p className="text-xs text-muted-foreground">Next 14 days</p>
            </div>
            <Link href="/subscriptions" className="text-sm text-primary hover:underline">
              Subscriptions
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingSubscriptions.length ? (
              upcomingSubscriptions.map((subscription) => (
                <div key={subscription.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{subscription.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(getSubscriptionNextPaymentDate(subscription, today))} · {isSubscriptionDatePredicted(subscription, today) ? "Expected" : "Confirmed by bank"}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{fmtCurrency(subscription.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No active subscriptions due in the next 14 days.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent dividends &amp; interest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentIncome.length ? (
              <>
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">Total · last 60 days</span>
                  <span className="font-semibold tabular-nums">{fmtCurrency(recentIncomeTotal)}</span>
                </div>
                {recentIncome.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {accountById.get(transaction.accountId)?.name ?? "Account"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(transaction.date)} · {transaction.type === "dividend" ? "Dividend" : "Interest"}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">{fmtCurrency(transaction.amount)}</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No dividends or interest in the last 60 days.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net worth history</CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthChart data={series} />
          <p className="mt-2 text-xs text-muted-foreground">
            Some accounts were added recently, so their part of the chart starts flat.
          </p>
        </CardContent>
      </Card>

      <AccountChanges
        changes={{
          day: accountChanges(accounts, snapshots, transactions, todayDate, 1),
          week: accountChanges(accounts, snapshots, transactions, todayDate, 7),
          month: accountChanges(accounts, snapshots, transactions, todayDate, 30),
          year: accountChanges(accounts, snapshots, transactions, todayDate, 365),
        }}
        institutionNames={Object.fromEntries(institutions.map((institution) => [
          institution.id,
          institution.name,
        ]))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {sortAccountsByClass(
              accounts,
              new Map(institutions.map((institution) => [institution.id, institution.name])),
            ).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/accounts/${a.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    {isAdmin && <div className="text-xs text-muted-foreground">
                      {instById[a.institutionId]?.name}
                      {a.mask ? ` ····${a.mask}` : ""} ·{" "}
                      {a.isManual
                        ? "Manual"
                        : a.lastSyncedAt
                          ? `synced ${new Date(a.lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: APP_TIMEZONE })}`
                          : "never synced"}
                      {a.connectionStatus === "needs_reauth" && (
                        <span className="ml-2 text-amber-600">reconnect needed</span>
                      )}
                    </div>}
                  </div>
                  <div className={isLiability(a) ? "text-sm font-medium tabular-nums text-muted-foreground" : "text-sm font-medium tabular-nums"}>
                    {isLiability(a)
                      ? `Owe ${fmtCurrency(Math.abs(a.currentBalance))}`
                      : fmtCurrency(a.currentBalance)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
