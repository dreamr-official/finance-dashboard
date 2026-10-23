import Link from "next/link";
import { Fragment } from "react";
import { getDataset } from "@/lib/data/provider";
import { APP_TIMEZONE, appToday } from "@/lib/dates";
import { getSessionUser } from "@/lib/auth";
import { capSlices, groupHoldingsBySymbol, holdingsWithShare } from "@/lib/holdings";
import { fmtCompact, fmtCurrency, fmtShare } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import {
  compareNewestFirst,
  groupByMonth,
  PAGE_STEP,
  parseLimit,
  withParams,
} from "@/lib/transaction-list";
import {
  AddPastBalanceButton,
  AddTransactionButton,
  EditAccountButton,
  DeleteTransactionButton,
  RebuildHistoryButton,
  TransactionTypeSelect,
} from "./account-actions";
import { BalanceChart } from "@/components/balance-chart";
import { DonutChart } from "@/components/charts/donut-chart";
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
import { TransferButton } from "../transfer-dialog";
import {
  AddHoldingButton,
  HoldingRowActions,
  HoldingsManager,
} from "./holdings-manager";
import { canManageHoldings } from "@/lib/manual-holdings";
import { TRANSACTION_TYPE_LABELS, transactionCountLabel } from "@/lib/transactions";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const limit = parseLimit(queryParams.limit);
  const [{ accounts, institutions, snapshots, transactions, holdings }, user] =
    await Promise.all([getDataset(), getSessionUser()]);
  const isAdmin = user?.role === "admin";
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();
  const inst = institutions.find((i) => i.id === account.institutionId);
  const hist = snapshots
    .filter((s) => s.accountId === id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const todayDate = appToday();
  if (hist.length > 0 && hist[hist.length - 1].date < todayDate) {
    hist.push({ accountId: id, date: todayDate, balance: account.currentBalance });
  }
  const allTxns = transactions
    .filter((t) => t.accountId === id)
    .sort(compareNewestFirst);
  const visibleTxns = allTxns.slice(0, limit);
  const monthGroups = groupByMonth(visibleTxns, allTxns, accounts, transactions, true);
  const acctHoldings = holdings.filter((h) => h.accountId === id);
  const holdingShares = holdingsWithShare(acctHoldings);
  const holdingTotal = holdingShares.reduce((sum, holding) => sum + holding.value, 0);
  const showHoldings =
    account.assetClass === "investment" ||
    account.assetClass === "retirement" ||
    acctHoldings.length > 0;
  const canEditHoldings = isAdmin && canManageHoldings(account);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{inst?.name}</p>
            <h1
              className="break-words text-xl font-semibold tracking-tight sm:truncate sm:text-2xl"
              title={account.name}
            >
              {account.name}
            </h1>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {account.isManual && (
                <div className="md:hidden">
                  <AddTransactionButton account={account} />
                </div>
              )}
              <div className="hidden flex-wrap items-center gap-2 md:flex">
                {account.isManual && <AddTransactionButton account={account} />}
                <AddPastBalanceButton accountId={account.id} />
                {(account.assetClass === "cash" || account.assetClass === "liability") && (
                  <RebuildHistoryButton accountId={account.id} />
                )}
                {(account.isManual || accounts.some((a) => a.isManual && a.id !== account.id)) && (
                  <TransferButton accounts={accounts} initialFromAccountId={account.id} />
                )}
                <EditAccountButton account={account} />
              </div>
              <details className="relative md:hidden">
                <summary className="flex h-10 cursor-pointer list-none items-center rounded-lg border bg-background px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  More
                </summary>
                <div className="absolute right-0 top-full z-20 mt-2 flex min-w-52 flex-col items-stretch gap-2 rounded-lg border bg-background p-2 shadow-lg [&_button]:min-h-10 [&_button]:min-w-10">
                  <AddPastBalanceButton accountId={account.id} />
                  {(account.assetClass === "cash" || account.assetClass === "liability") && (
                    <RebuildHistoryButton accountId={account.id} />
                  )}
                  {(account.isManual || accounts.some((a) => a.isManual && a.id !== account.id)) && (
                    <TransferButton accounts={accounts} initialFromAccountId={account.id} />
                  )}
                  <EditAccountButton account={account} />
                </div>
              </details>
            </div>
          )}
        </div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          {account.assetClass === "liability"
            ? `Owe ${fmtCurrency(Math.abs(account.currentBalance))}`
            : fmtCurrency(account.currentBalance)}
        </div>
        {isAdmin && (
          <div className="mt-1 text-xs text-muted-foreground">
            {account.isManual
              ? "Manual · manual account"
              : account.lastSyncedAt
                ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString("en-US", { timeZone: APP_TIMEZONE })}`
                : "Never synced"}
          </div>
        )}
        {!account.isManual &&
          (account.assetClass === "investment" || account.assetClass === "retirement") &&
          account.connectionNotice && (
            <p className="mt-2 max-w-2xl text-sm text-amber-700 dark:text-amber-400">
              {account.connectionNotice}
            </p>
          )}
      </div>

      {hist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {account.assetClass === "liability" ? "Amount owed" : "Balance history"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceChart
              data={hist.map((point) => ({
                ...point,
                balance:
                  account.assetClass === "liability"
                    ? Math.abs(point.balance)
                    : point.balance,
              }))}
              label={account.assetClass === "liability" ? "Amount owed" : "Balance"}
            />
          </CardContent>
        </Card>
      )}

      {showHoldings && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>Holdings</CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {acctHoldings.length > 0 && (
                <span className="shrink-0 text-right text-xs font-normal text-muted-foreground">
                  {holdingShares.length} positions · {fmtCurrency(holdingTotal)}
                </span>
              )}
              {canEditHoldings && <AddHoldingButton accountId={account.id} />}
            </div>
          </CardHeader>
          {!acctHoldings.length ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {account.isManual
                  ? "No holdings yet — add your first holding."
                  : "No holdings yet — grant investment access in Settings to pull them from Plaid."}
              </p>
            </CardContent>
          ) : (
            <CardContent className="space-y-5">
              <DonutChart
                data={capSlices(groupHoldingsBySymbol(acctHoldings))}
                centerValue={fmtCompact(holdingTotal)}
                centerLabel="Holdings"
              />
              <div className="space-y-3 md:hidden">
                {holdingShares.map((h) => {
                  const gainLoss = h.costBasis === undefined ? undefined : h.value - h.costBasis;
                  return (
                    <article key={h.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{h.symbol}</div>
                          <div className="truncate text-xs text-muted-foreground">{h.name}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="text-right font-medium tabular-nums">
                            {fmtCurrency(h.value)}
                          </div>
                          {canEditHoldings && (
                            <HoldingRowActions accountId={account.id} holding={h} />
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Quantity</div>
                          <div className="tabular-nums">
                            {h.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Price</div>
                          <div className="tabular-nums">{fmtCurrency(h.price)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">% of account</div>
                          <div className="tabular-nums">{fmtShare(h.pct)}</div>
                        </div>
                        {h.costBasis !== undefined && (
                          <>
                            <div>
                              <div className="text-xs text-muted-foreground">Cost basis</div>
                              <div className="tabular-nums">{fmtCurrency(h.costBasis)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Gain / loss</div>
                              <div
                                className={`tabular-nums ${
                                  gainLoss! >= 0
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {fmtCurrency(gainLoss!, { sign: true })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">% of account</TableHead>
                        <TableHead className="text-right">Cost basis</TableHead>
                        {canEditHoldings && (
                          <TableHead className="w-24 text-right">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdingShares.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>
                            <div className="font-medium">{h.symbol}</div>
                            <div className="max-w-48 truncate text-xs text-muted-foreground">
                              {h.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {h.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtCurrency(h.price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtCurrency(h.value)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtShare(h.pct)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {h.costBasis === undefined ? "—" : fmtCurrency(h.costBasis)}
                          </TableCell>
                          {canEditHoldings && (
                            <TableCell className="text-right">
                              <HoldingRowActions accountId={account.id} holding={h} />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {canManageHoldings(account) && (
                <HoldingsManager account={account} holdings={acctHoldings} />
              )}
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Transactions</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Showing {visibleTxns.length.toLocaleString()} of {allTxns.length.toLocaleString()}{" "}
                {allTxns.length === 1 ? "transaction" : "transactions"}
              </p>
            </div>
            <Link
              href={`/activity?account=${encodeURIComponent(account.id)}`}
              className={buttonVariants({ variant: "outline" })}
            >
              View all {transactionCountLabel(allTxns.length)} in Activity
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-3 md:hidden">
          {monthGroups.map((group) => (
            <section key={group.month}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="font-medium">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {transactionCountLabel(group.count)}
                  </span>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  In {fmtCurrency(group.moneyIn)} · Out {fmtCurrency(group.moneyOut)}
                </p>
              </div>
              <div className="mt-2 space-y-3">
                {group.transactions.map((t) => (
                  <article key={t.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t.date}</span>
                          {isAdmin ? (
                            <TransactionTypeSelect
                              transactionId={t.id}
                              transactionType={t.type}
                              transactionName={t.name}
                              transactionDate={t.date}
                              transactionTaxYear={t.taxYear}
                              accountType={account.type}
                            />
                          ) : (
                            <Badge variant={t.type === "deposit" ? "default" : "outline"}>
                              {TRANSACTION_TYPE_LABELS[t.type]}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div
                        className={
                          "shrink-0 text-right font-medium tabular-nums " +
                          (t.amount >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "")
                        }
                      >
                        {fmtCurrency(t.amount, { sign: true })}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="mt-3 flex justify-end border-t pt-3">
                        <DeleteTransactionButton id={t.id} showLabel />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!allTxns.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          )}
        </CardContent>
        <div className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isAdmin && <TableHead className="w-8" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthGroups.map((group) => (
                  <Fragment key={group.month}>
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} className="bg-muted/30">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium">{group.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {transactionCountLabel(group.count)}
                            </span>
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            In {fmtCurrency(group.moneyIn)} · Out {fmtCurrency(group.moneyOut)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {group.transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground">{t.date}</TableCell>
                        <TableCell>{t.name}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <TransactionTypeSelect
                              transactionId={t.id}
                              transactionType={t.type}
                              transactionName={t.name}
                              transactionDate={t.date}
                              transactionTaxYear={t.taxYear}
                              accountType={account.type}
                            />
                          ) : (
                            <Badge variant={t.type === "deposit" ? "default" : "outline"}>
                              {TRANSACTION_TYPE_LABELS[t.type]}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            "text-right tabular-nums " +
                            (t.amount >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "")
                          }
                        >
                          {fmtCurrency(t.amount, { sign: true })}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DeleteTransactionButton id={t.id} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </div>
      </Card>
      {visibleTxns.length < allTxns.length && (
        <div className="flex justify-center">
          <Link
            href={withParams(`/accounts/${account.id}`, {}, {
              limit: String(limit + PAGE_STEP),
            })}
            scroll={false}
            className={buttonVariants({ variant: "outline" })}
          >
            Show more (next {Math.min(PAGE_STEP, allTxns.length - visibleTxns.length)})
          </Link>
        </div>
      )}
    </div>
  );
}
