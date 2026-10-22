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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Total net worth</p>
        <h1 className="text-4xl font-semibold tracking-tight tabular-nums">
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
                  className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-accent/50"
                >
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
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
