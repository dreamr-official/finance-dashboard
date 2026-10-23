import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDataset } from "@/lib/data/provider";
import { appToday, shiftDate } from "@/lib/dates";
import {
  buildTransferReport,
  MATCH_WINDOW_DAYS,
  type TransferKind,
  type TransferPair,
  type UnmatchedLeg,
} from "@/lib/transfer-match";
import type { Account } from "@/lib/types";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAIRS = 300;

const KIND_LABEL: Record<TransferKind, string> = {
  transfer: "Transfer",
  card_payment: "Card payment",
  loan_payment: "Loan payment",
};

function dateParam(value: string | string[] | undefined, fallback: string) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function isoDaysAgo(today: string, days: number) {
  return shiftDate(today, -days);
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [{ accounts, transactions }, params] = await Promise.all([
    getDataset(),
    searchParams,
  ]);
  const today = appToday();
  const from = dateParam(params.from, isoDaysAgo(today, 365));
  const to = dateParam(params.to, today);
  const accountId =
    typeof params.account === "string" && accounts.some((a) => a.id === params.account)
      ? params.account
      : "";

  const report = buildTransferReport(transactions, accounts, {
    today,
    from,
    to,
    accountId: accountId || undefined,
  });
  const unmatched = [...report.unmatchedOut, ...report.unmatchedIn].sort(
    (a, b) =>
      b.transaction.date.localeCompare(a.transaction.date) ||
      a.transaction.id.localeCompare(b.transaction.id),
  );
  const needsReview = unmatched.filter((leg) => leg.status === "needs_review");
  const pending = unmatched.filter((leg) => leg.status === "pending");
  const visiblePairs = report.pairs.slice(0, MAX_PAIRS);
  const { summary } = report;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transfers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Money moved between your own accounts, matched leg to leg so you can see that
          everything that left one account arrived in another.
        </p>
      </div>

      <form
        key={`${from}|${to}|${accountId}`}
        method="get"
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Account
          <select
            name="account"
            defaultValue={accountId}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-base text-foreground md:text-sm"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Apply filters
          </button>
          <Link href="/transfers" className="pb-2 text-sm text-muted-foreground underline">
            Reset
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <SummaryCard
          title="Matched"
          count={summary.matched.count}
          total={summary.matched.total}
          noun="transfer"
        />
        <SummaryCard
          title="Needs review"
          count={summary.needsReview.count}
          total={summary.needsReview.total}
          noun="leg"
        />
        <div className="col-span-2 sm:col-span-1">
          <SummaryCard
            title="Pending"
            count={summary.pending.count}
            total={summary.pending.total}
            noun="leg"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Needs review
            {needsReview.length > 0 && <StatusBadge status="needs_review" label={String(needsReview.length)} />}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Money that left an account with no matching arrival (or arrived with no matching
            source) within {MATCH_WINDOW_DAYS} days. Still pending, sent to an account that
            isn&apos;t linked, or a typo?
          </p>
        </CardHeader>
        <CardContent>
          {needsReview.length ? (
            <ul className="divide-y">
              {needsReview.map((leg) => (
                <UnmatchedRow key={leg.transaction.id} leg={leg} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to review — every transfer in this range has a matching other side.
            </p>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <p className="text-sm text-muted-foreground">
              From the last {MATCH_WINDOW_DAYS} days or still pending at the bank. The other
              side usually shows up within a few business days.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {pending.map((leg) => (
                <UnmatchedRow key={leg.transaction.id} leg={leg} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Routes</CardTitle>
          <p className="text-sm text-muted-foreground">Matched totals by where the money went.</p>
        </CardHeader>
        <CardContent>
          {report.routes.length ? (
            <ul className="divide-y">
              {report.routes.map((route) => (
                <li
                  key={route.key}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <AccountPath from={route.from} to={route.to} />
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {KIND_LABEL[route.kind]} · {route.count}{" "}
                      {route.count === 1 ? "transfer" : "transfers"} · last{" "}
                      {fmtDate(`${route.lastDate}T00:00:00`)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-medium tabular-nums">
                    {fmtCurrency(route.total)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No matched transfers in this range.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matched transfers</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each outgoing amount paired with an equal arrival within {MATCH_WINDOW_DAYS} days,
            newest first.
          </p>
        </CardHeader>
        <CardContent>
          {visiblePairs.length ? (
            <ul className="divide-y">
              {visiblePairs.map((pair) => (
                <PairRow key={pair.id} pair={pair} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No matched transfers in this range.</p>
          )}
          {report.pairs.length > MAX_PAIRS && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the newest {MAX_PAIRS} of {report.pairs.length}. Narrow the date range to
              see older ones.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  total,
  noun,
}: {
  title: string;
  count: number;
  total: number;
  noun: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{fmtCurrency(total)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? noun : `${noun}s`}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: "matched" | "needs_review" | "pending";
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        status === "matched" &&
          "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "needs_review" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "pending" && "border-border text-muted-foreground",
      )}
    >
      {label ?? (status === "matched" ? "Matched" : status === "pending" ? "Pending" : "Needs review")}
    </span>
  );
}

function AccountLink({ account }: { account: Account }) {
  return (
    <Link
      href={`/accounts/${account.id}`}
      className="inline-flex min-h-9 min-w-0 items-center truncate hover:underline"
    >
      {account.name}
    </Link>
  );
}

function AccountPath({ from, to }: { from: Account; to: Account }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm font-medium">
      <AccountLink account={from} />
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="to" />
      <AccountLink account={to} />
    </div>
  );
}

function lagLabel(lagDays: number) {
  if (lagDays === 0) return "same day";
  const days = Math.abs(lagDays);
  return `${days} ${days === 1 ? "day" : "days"} ${lagDays > 0 ? "later" : "earlier"}`;
}

function PairRow({ pair }: { pair: TransferPair }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <AccountPath from={pair.from} to={pair.to} />
        <div className="mt-0.5 text-xs text-muted-foreground">
          {KIND_LABEL[pair.kind]} · sent {fmtDate(`${pair.outDate}T00:00:00`)} · arrived{" "}
          {lagLabel(pair.lagDays)}
          {pair.confirmed && " · linked"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums">{fmtCurrency(pair.amount)}</span>
        <StatusBadge status="matched" />
      </div>
    </li>
  );
}

function UnmatchedRow({ leg }: { leg: UnmatchedLeg }) {
  const out = leg.direction === "out";
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          <AccountLink account={leg.account} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {leg.transaction.name} · {fmtDate(`${leg.transaction.date}T00:00:00`)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {out ? "Left this account, no arrival found" : "Arrived, no source found"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums">
          {fmtCurrency(out ? -leg.amount : leg.amount, { sign: true })}
        </span>
        <StatusBadge status={leg.status} />
      </div>
    </li>
  );
}
