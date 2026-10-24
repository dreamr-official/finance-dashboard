import Link from "next/link";
import { Fragment } from "react";
import { getDataset } from "@/lib/data/provider";
import { summarizeActivity, summarizeWhereItWent } from "@/lib/activity";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { sortAccountsByClass } from "@/lib/account-types";
import { TRANSACTION_TYPE_LABELS, transactionCountLabel } from "@/lib/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  filterTransactions,
  groupByMonth,
  PAGE_STEP,
  parseLimit,
  parseTransactionFilters,
  withParams,
} from "@/lib/transaction-list";

const TYPE_OPTIONS = [
  "deposit",
  "withdrawal",
  "transfer_in",
  "transfer_out",
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "expense",
  "income",
  "other",
];

type SearchParams = Record<string, string | string[] | undefined>;

function formatPeriodDate(date: string, includeYear = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [{ accounts, institutions, transactions }, params] = await Promise.all([
    getDataset(),
    searchParams,
  ]);
  const filters = parseTransactionFilters(params);
  const periodLabel = filters.month
    ? new Date(`${filters.month}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : filters.from && filters.to
      ? `${formatPeriodDate(filters.from, filters.from.slice(0, 4) !== filters.to.slice(0, 4))} – ${formatPeriodDate(filters.to, filters.from.slice(0, 4) !== filters.to.slice(0, 4))}`
      : filters.from
        ? `From ${formatPeriodDate(filters.from, true)}`
        : filters.to
          ? `Through ${formatPeriodDate(filters.to, true)}`
          : "All time";
  const limit = parseLimit(params.limit);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const sortedAccounts = sortAccountsByClass(
    accounts,
    new Map(institutions.map((institution) => [institution.id, institution.name])),
  );
  const filtered = filterTransactions(transactions, filters);
  const summary = summarizeActivity(filtered, accounts, transactions);
  const visible = filtered.slice(0, limit);
  const monthGroups = groupByMonth(visible, filtered, accounts, transactions);
  const currentParams = {
    account: filters.accountId,
    type: filters.type,
    month: filters.month,
    from: filters.from,
    to: filters.to,
    q: filters.q,
  };
  const whereItWent = summarizeWhereItWent(filtered, transactions, accounts);
  const maxCategoryAmount = whereItWent[0]?.[1] ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All account transactions, including transfers between your own accounts.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Account
          <select
            name="account"
            defaultValue={filters.accountId}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          >
            <option value="">All accounts</option>
            {sortedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Type
          <select
            name="type"
            defaultValue={filters.type}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {TRANSACTION_TYPE_LABELS[option as keyof typeof TRANSACTION_TYPE_LABELS]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Month
          <input
            name="month"
            type="month"
            defaultValue={filters.month}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            name="from"
            type="date"
            defaultValue={filters.from}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            name="to"
            type="date"
            defaultValue={filters.to}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Name or category"
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Apply filters
          </button>
          <Link href="/activity" className="pb-2 text-sm text-muted-foreground underline">
            Clear
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryCard title={`Money in · ${periodLabel}`} amount={summary.moneyIn} />
        <SummaryCard title={`Money out · ${periodLabel}`} amount={summary.moneyOut} />
        <SummaryCard
          title={`Interest & dividends · ${periodLabel}`}
          amount={summary.interestAndDividends}
        />
        <SummaryCard
          title={`Investment contributions · ${periodLabel}`}
          amount={summary.contributions}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where it went</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {whereItWent.length ? (
            whereItWent.map(([category, amount]) => (
              <div key={category} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{category}</div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(amount / maxCategoryAmount) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm tabular-nums">{fmtCurrency(amount)}</div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No expenses in this filtered set.</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">
              Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}{" "}
              {filtered.length === 1 ? "transaction" : "transactions"}
        </p>
        {visible.length ? (
          <>
            <div className="space-y-4 md:hidden">
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
                  <div className="mt-2 space-y-2">
                    {group.transactions.map((transaction) => (
                      <article key={transaction.id} className="rounded-lg border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{transaction.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {accountById.get(transaction.accountId)?.name ?? "Account"} ·{" "}
                              {fmtDate(transaction.date)}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-medium tabular-nums">
                            {fmtCurrency(transaction.amount, { sign: true })}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant={transaction.type === "deposit" ? "default" : "outline"}>
                            {TRANSACTION_TYPE_LABELS[transaction.type]}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {transaction.category || "Uncategorized"}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthGroups.map((group) => (
                    <Fragment key={group.month}>
                      <tr>
                        <td colSpan={6} className="bg-muted/30 px-3 py-2">
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
                        </td>
                      </tr>
                      {group.transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="whitespace-nowrap px-3 py-2">{fmtDate(transaction.date)}</td>
                          <td className="max-w-48 truncate px-3 py-2">
                            {accountById.get(transaction.accountId)?.name ?? "Account"}
                          </td>
                          <td className="max-w-64 truncate px-3 py-2">{transaction.name}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {TRANSACTION_TYPE_LABELS[transaction.type]}
                          </td>
                          <td className="px-3 py-2">{transaction.category || "Uncategorized"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {fmtCurrency(transaction.amount, { sign: true })}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </p>
        )}
        {visible.length < filtered.length && (
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={withParams("/activity", currentParams, {
                limit: String(limit + PAGE_STEP),
              })}
              scroll={false}
              className={buttonVariants({ variant: "outline" })}
            >
              Show more (next {Math.min(PAGE_STEP, filtered.length - visible.length)})
            </Link>
            <Link
              href={withParams("/activity", currentParams, {
                limit: String(filtered.length),
              })}
              scroll={false}
              className={buttonVariants({ variant: "outline" })}
            >
              Show all
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ title, amount }: { title: string; amount: number }) {
  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{fmtCurrency(amount)}</div>
      </CardContent>
    </Card>
  );
}
