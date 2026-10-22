import { getDataset } from "@/lib/data/provider";
import {
  applyNetWorthChange,
  computeNetWorth,
  isLiability,
  netWorthSeries,
} from "@/lib/finance";
import { fmtCompact, fmtCurrency } from "@/lib/format";
import { NetWorthChart } from "@/components/net-worth-chart";
import { StatCard } from "@/components/stat-card";
import { Delta } from "@/components/delta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";


export default async function OverviewPage() {
  const { accounts, institutions, snapshots } = await getDataset();
  const summary = applyNetWorthChange(
    computeNetWorth(accounts),
    netWorthSeries(accounts, snapshots),
  );
  const series = netWorthSeries(accounts, snapshots);
  const instById = Object.fromEntries(institutions.map((i) => [i.id, i]));
  const assetAccounts = accounts.filter((account) => !isLiability(account));
  const groups = [
    { label: "Cash", accounts: assetAccounts.filter((account) => account.assetClass === "cash") },
    {
      label: "Investments",
      accounts: assetAccounts.filter((account) => account.assetClass === "investment"),
    },
    {
      label: "Retirement",
      accounts: assetAccounts.filter((account) => account.assetClass === "retirement"),
    },
    {
      label: "Other assets",
      accounts: assetAccounts.filter(
        (account) =>
          !["cash", "investment", "retirement"].includes(account.assetClass),
      ),
    },
  ].map((group) => ({
    ...group,
    amount: group.accounts.reduce((sum, account) => sum + account.currentBalance, 0),
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
        <StatCard title="Liabilities" value={fmtCompact(summary.liabilities)} />
        <StatCard title="Cash" value={fmtCompact(summary.cash)} />
        <StatCard title="Investments" value={fmtCompact(summary.investments)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where your money sits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{group.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {summary.assets > 0
                      ? `${((group.amount / summary.assets) * 100).toFixed(1)}%`
                      : "0%"}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${maxAssetGroup > 0 ? (group.amount / maxAssetGroup) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-sm font-medium tabular-nums">
                {fmtCurrency(group.amount, { decimals: 0 })}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">Liabilities</span>
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
              {fmtCurrency(-Math.abs(summary.liabilities), { decimals: 0 })}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net worth history</CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthChart data={series} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {accounts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/accounts/${a.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {instById[a.institutionId]?.name}
                      {a.mask ? ` ····${a.mask}` : ""} ·{" "}
                      {a.lastSyncedAt
                        ? `synced ${new Date(a.lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "never synced"}
                      {a.connectionStatus === "needs_reauth" && (
                        <span className="ml-2 text-amber-600">reconnect needed</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={
                      isLiability(a)
                        ? "text-sm font-medium tabular-nums text-red-600 dark:text-red-400"
                        : "text-sm font-medium tabular-nums"
                    }
                  >
                    {fmtCurrency(a.currentBalance)}
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
