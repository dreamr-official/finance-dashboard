import { getDataset } from "@/lib/data/provider";
import { getSessionUser } from "@/lib/auth";
import { appToday } from "@/lib/dates";
import { rothContributions, DEFAULT_ROTH_LIMITS } from "@/lib/finance";
import {
  classifyInvestmentFlows,
  contributionTaxYear,
  rothLookalikes,
} from "@/lib/contributions";
import type { ContributionEntry } from "@/lib/contributions";
import { ACCOUNT_TYPE_LABELS, sortAccountsByClass } from "@/lib/account-types";
import {
  capSlices,
  groupHoldingsByAssetType,
  groupHoldingsBySymbol,
  holdingsWithShare,
} from "@/lib/holdings";
import { fmtCompact, fmtCurrency, fmtDate, fmtPct, fmtShare } from "@/lib/format";
import { Delta } from "@/components/delta";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transactions";
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

function contributionLabel(flow: ContributionEntry) {
  switch (flow.source) {
    case "deposit":
    case "transfer_from_cash":
    case "transfer_from_investment":
      return flow.fromAccount
        ? `from ${flow.fromAccount.name}${flow.fromAccount.assetClass === "investment" || flow.fromAccount.assetClass === "retirement" ? " (your account)" : ""}`
        : "source not found";
    case "withdrawal":
      return TRANSACTION_TYPE_LABELS.withdrawal;
    case "transfer_unmatched":
      return "source not found";
    case "transfer_to_cash":
      return flow.toAccount
        ? `to ${flow.toAccount.name}`
        : TRANSACTION_TYPE_LABELS.transfer_out;
    case "transfer_out_unmatched":
      return TRANSACTION_TYPE_LABELS.transfer_out;
    case "other":
      return TRANSACTION_TYPE_LABELS.other;
  }
  return TRANSACTION_TYPE_LABELS.transfer_in;
}

export default async function InvestmentsPage() {
  const TAX_YEAR = Number(appToday().slice(0, 4));
  const [{ accounts, institutions, transactions, holdings }, user] =
    await Promise.all([getDataset(), getSessionUser()]);
  const isAdmin = user?.role === "admin";
  const rothAccounts = accounts.filter((account) => account.type === "roth_ira");
  const investmentAccounts = accounts.filter(
    (a) => a.assetClass === "investment" || a.assetClass === "retirement",
  );
  const investAccounts = sortAccountsByClass(
    investmentAccounts,
    new Map(institutions.map((institution) => [institution.id, institution.name])),
  );
  const investAccountIds = new Set(investAccounts.map((a) => a.id));
  const investHoldings = holdings.filter((holding) => investAccountIds.has(holding.accountId));
  const institutionById = new Map(institutions.map((institution) => [institution.id, institution]));
  const symbolGroups = groupHoldingsBySymbol(
    investHoldings,
    new Map(accounts.map((account) => [account.id, account.name] as const)),
  );
  const assetTypeSlices = groupHoldingsByAssetType(investHoldings);
  const holdingTotal = symbolGroups.reduce((sum, holding) => sum + holding.value, 0);
  const flows = classifyInvestmentFlows(accounts, transactions);
  const thisYearContributions = flows.counted
    .filter(
      (flow) =>
        flow.amount > 0 && flow.transaction.date.startsWith(String(TAX_YEAR)),
    )
    .reduce((sum, flow) => sum + flow.amount, 0);
  const allTimeContributions = flows.counted
    .filter((flow) => flow.amount > 0)
    .reduce((sum, flow) => sum + flow.amount, 0);
  const rothTransfersByAccount = new Map<
    string,
    { amount: number; sources: Set<string> }
  >();
  for (const flow of flows.notCounted) {
    if (
      flow.source !== "transfer_from_investment" ||
      flow.account.type !== "roth_ira" ||
      flow.fromAccount?.assetClass === "retirement" ||
      contributionTaxYear(flow.transaction) !== TAX_YEAR ||
      flow.amount <= 0
    ) {
      continue;
    }
    const existing = rothTransfersByAccount.get(flow.account.id) ?? {
      amount: 0,
      sources: new Set<string>(),
    };
    existing.amount += flow.amount;
    if (flow.fromAccount) existing.sources.add(flow.fromAccount.name);
    rothTransfersByAccount.set(flow.account.id, existing);
  }
  const contributionByAccount = investAccounts
    .map((account) => {
      const counted = flows.counted.filter((flow) => flow.account.id === account.id);
      const incomingNotCounted = flows.notCounted.filter(
        (flow) => flow.account.id === account.id && flow.amount > 0,
      );
      const accountTransactions = transactions.filter(
        (transaction) => transaction.accountId === account.id,
      );
      const amount = counted
        .filter((flow) => flow.amount > 0)
        .reduce((sum, flow) => sum + flow.amount, 0);
      let hint: string | null = null;
      if (amount === 0) {
        if (incomingNotCounted.length) {
          const examples = [
            ...new Set(
              incomingNotCounted.map((flow) =>
                flow.source === "other"
                  ? "type Other"
                  : flow.fromAccount
                    ? `transfer from ${flow.fromAccount.name}`
                    : "transfer in",
              ),
            ),
          ].slice(0, 2);
          hint = `${incomingNotCounted.length} incoming not counted (e.g. ${examples.join(", or ")}) — open account to change type`;
        } else if (
          accountTransactions.length === 0 &&
          !account.isManual &&
          institutionById.get(account.institutionId)?.provider === "plaid"
        ) {
          hint = "No activity received yet — Settings → Grant investment access, then Sync now";
        } else if (account.isManual) {
          hint = "No deposits logged — Add transaction → Deposit";
        } else if (accountTransactions.length === 0) {
          hint = "No activity received yet — Settings → Grant investment access, then Sync now";
        } else {
          hint = "No qualifying contributions yet — review account activity.";
        }
      }
      return { account, amount, hint };
    })
    .sort((a, b) => b.amount - a.amount);
  const contributionHintsByAccount = new Map(
    contributionByAccount.map(({ account, hint }) => [account.id, hint]),
  );
  const contributionsByDate = new Map<string, number>();
  for (const flow of flows.counted) {
    const { transaction, amount } = flow;
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
    const accountFlows = flows.counted
      .filter((flow) => flow.account.id === account.id)
      .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
    const deposits = accountFlows
      .filter((flow) => flow.amount > 0)
      .reduce((sum, flow) => sum + flow.amount, 0);
    return {
      account,
      currentValue: account.currentBalance,
      totalDeposits: deposits,
      netContributions: accountFlows.reduce((sum, flow) => sum + flow.amount, 0),
      contributionLog: accountFlows,
    };
  });
  const roth = rothContributions(accounts, transactions, TAX_YEAR);
  const rothNameLookalikes = rothLookalikes(accounts);
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
            {contributionByAccount.map(({ account, amount, hint }) => {
              const rothTransfer = rothTransfersByAccount.get(account.id);
              return (
              <div
                key={account.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{account.name}</div>
                  {rothTransfer && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtCurrency(rothTransfer.amount, { sign: true, decimals: 0 })} moved from{" "}
                      {[...rothTransfer.sources].join(", ")} (counts toward IRS limit)
                    </div>
                  )}
                  {isAdmin && hint && (
                    <Link
                      href={`/accounts/${account.id}`}
                      className="mt-1 block text-xs text-muted-foreground hover:underline"
                    >
                      {hint}
                    </Link>
                  )}
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
              );
            })}
            {!contributionByAccount.length && (
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "No investment accounts yet." : "No activity yet"}
              </p>
            )}
            <Link
              href="/transfers"
              className="block border-t pt-3 text-sm text-muted-foreground hover:underline"
            >
              Check these against your bank transfers →
            </Link>
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
                {isAdmin
                  ? "No holdings yet — link via Plaid (Settings → Grant investment access) or add manually."
                  : "No activity yet"}
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
                {isAdmin
                  ? "No holdings yet — link via Plaid (Settings → Grant investment access) or add manually."
                  : "No activity yet"}
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
              {isAdmin ? "No contribution activity to chart yet." : "No activity yet"}
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
              {fmtCurrency(roth.deposits, { decimals: 0 })} contributed
              {rothLimit ? ` · limit ${fmtCurrency(rothLimit, { decimals: 0 })}` : ""}
            </span>
            {rothLimit && (
              <span className={roth.deposits > rothLimit ? "text-destructive" : "text-muted-foreground"}>
                {roth.deposits > rothLimit
                  ? `Over by ${fmtCurrency(roth.deposits - rothLimit, { decimals: 0 })}`
                  : `${fmtCurrency(rothLimit - roth.deposits, { decimals: 0 })} remaining`}
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${rothPct ?? 0}%` }}
            />
          </div>
          {rothLimit && roth.deposits > rothLimit && (
            <p className="mt-2 text-xs text-muted-foreground">
              Contributions over the IRS limit can owe a 6% penalty each year unless removed
              before the tax deadline.
            </p>
          )}
          {roth.byAccount.length > 0 && (
            <div className="mt-3 space-y-2">
              {roth.byAccount.map(({ account, deposits }) => (
                <div key={account.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {account.name}
                    </Link>
                    <span className="shrink-0 tabular-nums">
                      {fmtCurrency(deposits, { decimals: 0 })}
                    </span>
                  </div>
                  {deposits === 0 && (
                    isAdmin ? (
                    <Link
                      href={`/accounts/${account.id}`}
                      className="mt-0.5 block text-xs text-muted-foreground hover:underline"
                    >
                      {contributionHintsByAccount.get(account.id) ??
                        `No qualifying contributions for ${TAX_YEAR} — review account activity.`}
                    </Link>
                    ) : <p className="mt-0.5 text-xs text-muted-foreground">No activity yet</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Withdrawals this year: {fmtCurrency(roth.withdrawals, { decimals: 0 })}
          </p>
          {isAdmin && rothNameLookalikes.length > 0 && (
            <div className="mt-3 space-y-2">
              {rothNameLookalikes.map((account) => (
                <p key={account.id} className="text-xs text-muted-foreground">
                  “{account.name}” looks like a Roth IRA but is set to{" "}
                  {ACCOUNT_TYPE_LABELS[account.type]} — it isn’t counted.{" "}
                  <Link
                    href={`/accounts/${account.id}`}
                    className="underline hover:text-foreground"
                  >
                    Open the account and change its type to Roth IRA.
                  </Link>
                </p>
              ))}
            </div>
          )}
          {!rothAccounts.length ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {isAdmin
                ? "No account is marked as a Roth IRA — open the account and set its type to Roth IRA."
                : "No activity yet"}
            </p>
          ) : (
            roth.deposits === 0 && (
              isAdmin && (
                <p className="mt-2 text-sm text-muted-foreground">
                  No contributions found for {TAX_YEAR}. Qualifying transfers from cash or a
                  brokerage count automatically; IRA-to-IRA transfers do not count toward the limit.
                </p>
              )
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
                    <div className="text-xs text-muted-foreground">Total put in</div>
                    <div className="tabular-nums font-medium">
                      {fmtCurrency(s.totalDeposits, { decimals: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Put in, after withdrawals</div>
                    <div className="tabular-nums font-medium">
                      {fmtCurrency(s.netContributions, { decimals: 0 })}
                    </div>
                  </div>
                  {(() => {
                    const gainLoss = s.currentValue - s.netContributions;
                    const gainPct =
                      s.netContributions > 0 ? (gainLoss / s.netContributions) * 100 : null;
                    return (
                      <div className="col-span-2 flex items-start justify-between gap-3 border-t pt-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Gain / loss</div>
                          <p className="text-xs text-muted-foreground">
                            Value minus money put in that&apos;s tracked here
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Delta value={gainLoss} />
                          {gainPct !== null && (
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {fmtPct(gainPct)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Contribution log
                  </div>
                  {s.contributionLog.length ? (
                    <>
                    {s.contributionLog.slice(0, 8).map((flow) => (
                      <div
                        key={flow.transaction.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 break-words text-muted-foreground">
                          {fmtDate(flow.transaction.date)} ·{" "}
                          <span
                            className={
                              !flow.fromAccount &&
                              (flow.source === "deposit" || flow.source === "transfer_unmatched")
                                ? "text-muted-foreground"
                                : "text-foreground"
                            }
                          >
                            {contributionLabel(flow)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {fmtCurrency(flow.amount, { sign: true })}
                        </span>
                      </div>
                    ))}
                    {s.contributionLog.length > 8 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="min-h-9 cursor-pointer py-2">
                          Show all ({s.contributionLog.length})
                        </summary>
                        <div className="space-y-2">
                          {s.contributionLog.slice(8).map((flow) => (
                            <div
                              key={flow.transaction.id}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span>
                                {fmtDate(flow.transaction.date)} ·{" "}
                                <span
                                  className={
                                    !flow.fromAccount &&
                                    (flow.source === "deposit" || flow.source === "transfer_unmatched")
                                      ? "text-muted-foreground"
                                      : "text-foreground"
                                  }
                                >
                                  {contributionLabel(flow)}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {fmtCurrency(flow.amount, { sign: true })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {isAdmin ? "No contribution activity yet." : "No activity yet"}
                    </p>
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
        Deposits and transfers from cash count as contributed. Transfers between investment
        accounts, buys, sells, dividends, and fees do not add new money. Withdrawals and transfers
        back to cash reduce net contributions.
      </p>
    </div>
  );
}
