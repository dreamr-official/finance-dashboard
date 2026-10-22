import { getDataset } from "@/lib/data/provider";
import { fmtCurrency } from "@/lib/format";
import { BalanceChart } from "@/components/balance-chart";
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
import { notFound } from "next/navigation";


const TYPE_LABEL: Record<string, string> = {
  deposit: "contribution",
  withdrawal: "withdrawal",
  transfer_in: "transfer in",
  transfer_out: "transfer out",
  buy: "buy",
  sell: "sell",
};

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { accounts, institutions, snapshots, transactions, holdings } =
    await getDataset();
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();
  const inst = institutions.find((i) => i.id === account.institutionId);
  const hist = snapshots
    .filter((s) => s.accountId === id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const txns = transactions
    .filter((t) => t.accountId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);
  const acctHoldings = holdings.filter((h) => h.accountId === id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{inst?.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          {fmtCurrency(account.currentBalance)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {account.lastSyncedAt
            ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString()}`
            : "Never synced"}
          {account.isManual ? " · manual account" : ""}
        </div>
      </div>

      {hist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance history</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceChart data={hist} />
          </CardContent>
        </Card>
      )}

      {acctHoldings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acctHoldings.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-medium">{h.symbol}</div>
                      <div className="text-xs text-muted-foreground">{h.name}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(h.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(h.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">{t.date}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === "deposit" ? "default" : "outline"}>
                      {TYPE_LABEL[t.type] ?? t.type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={
                      "text-right tabular-nums " +
                      (t.amount >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "")
                    }
                  >
                    {fmtCurrency(t.amount, { sign: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
