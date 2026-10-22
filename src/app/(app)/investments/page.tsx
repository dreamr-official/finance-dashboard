import { getDataset } from "@/lib/data/provider";
import {
  contributionStats,
  rothContributions,
  DEFAULT_ROTH_LIMITS,
} from "@/lib/finance";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { ContributionsChart } from "@/components/contributions-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const { accounts, transactions, snapshots, holdings } = await getDataset();
  const investAccounts = accounts.filter(
    (a) => a.assetClass === "investment" || a.assetClass === "retirement",
  );
  const stats = investAccounts.map((a) =>
    contributionStats(
      a,
      transactions.filter((t) => t.accountId === a.id),
      snapshots.filter((s) => s.accountId === a.id),
    ),
  );
  const roth = rothContributions(accounts, transactions, TAX_YEAR);
  const rothLimit = DEFAULT_ROTH_LIMITS[TAX_YEAR];
  const rothPct = rothLimit ? Math.min(100, (roth.net / rothLimit) * 100) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
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
          const acct = investAccounts.find((a) => a.id === s.accountId)!;
          return (
            <Card key={s.accountId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <Link href={`/accounts/${acct.id}`} className="hover:underline">
                    {acct.name}
                  </Link>
                  <span className="tabular-nums">{fmtCurrency(s.currentValue)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Deposited</div>
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
                  <div>
                    <div className="text-xs text-muted-foreground">Growth</div>
                    <div
                      className={
                        s.simpleGain >= 0
                          ? "tabular-nums font-medium text-emerald-600 dark:text-emerald-400"
                          : "tabular-nums font-medium text-red-600 dark:text-red-400"
                      }
                    >
                      {fmtCurrency(s.simpleGain, { decimals: 0, sign: true })}{" "}
                      <span className="text-xs">{fmtPct(s.returnPct)}</span>
                    </div>
                  </div>
                </div>
                {s.series.length > 0 ? (
                  <ContributionsChart data={s.series} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Insufficient history for a performance chart — imports an opening
                    balance or CSV to enable it.
                  </p>
                )}
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
                <div className="flex flex-wrap gap-1">
                  {s.contributionsByMonth.slice(-6).map((c) => (
                    <Badge key={c.month} variant="secondary" className="tabular-nums">
                      {c.month}: {fmtCurrency(c.amount, { decimals: 0 })}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Deposits count only money in from outside. Buys, sells, dividends, and
        transfers between your own accounts never count as contributions.
        Returns shown are contribution-based (simple gain ÷ net contributions);
        time-weighted returns require full history.
      </p>
    </div>
  );
}
