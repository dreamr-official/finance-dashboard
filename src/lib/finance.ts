import {
  Account,
  BalanceSnapshot,
  ContributionStats,
  NetWorthSummary,
  Transaction,
} from "./types";

export function isLiability(a: Account) {
  return a.assetClass === "liability" || a.currentBalance < 0;
}

/** Contributions = external money in. Transfers between own accounts and
 *  buys/sells inside an investment account never count. */
export function isContribution(t: Transaction) {
  return t.type === "deposit";
}

export function isWithdrawal(t: Transaction) {
  return t.type === "withdrawal" || t.type === "fee";
}

export function computeNetWorth(accounts: Account[]): NetWorthSummary {
  const assets = accounts.filter((a) => !isLiability(a));
  const liabilities = accounts.filter(isLiability);
  const sum = (xs: Account[]) => xs.reduce((s, a) => s + a.currentBalance, 0);
  const cash = sum(assets.filter((a) => a.assetClass === "cash"));
  const investments = sum(
    assets.filter((a) => a.assetClass === "investment" || a.assetClass === "retirement"),
  );
  const assetTotal = sum(assets);
  const liabTotal = Math.abs(sum(liabilities));
  return {
    netWorth: assetTotal - liabTotal,
    assets: assetTotal,
    liabilities: liabTotal,
    cash,
    investments,
    change: { day: 0, week: 0, month: 0, year: 0 },
  };
}

/** Daily net-worth series from balance snapshots. */
export function netWorthSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
): { date: string; value: number }[] {
  const byAccount = new Map<string, BalanceSnapshot[]>();
  for (const s of snapshots) {
    const arr = byAccount.get(s.accountId) ?? [];
    arr.push(s);
    byAccount.set(s.accountId, arr);
  }
  const dates = [...new Set(snapshots.map((s) => s.date))].sort();
  const last: Record<string, number> = {};
  for (const a of accounts) last[a.id] = a.currentBalance;
  return dates.map((d) => {
    let total = 0;
    for (const a of accounts) {
      const snaps = (byAccount.get(a.id) ?? []).filter((s) => s.date <= d);
      const v = snaps.length ? snaps[snaps.length - 1].balance : last[a.id];
      total += a.assetClass === "liability" ? -Math.abs(v) : v;
    }
    return { date: d, value: total };
  });
}

export function applyNetWorthChange(
  summary: NetWorthSummary,
  series: { date: string; value: number }[],
): NetWorthSummary {
  if (series.length < 2) return summary;
  const now = series[series.length - 1].value;
  const lookup = (days: number) => {
    const cutoff = new Date(series[series.length - 1].date);
    cutoff.setDate(cutoff.getDate() - days);
    const prior = [...series].reverse().find((p) => new Date(p.date) <= cutoff);
    return prior ? now - prior.value : 0;
  };
  summary.change = {
    day: lookup(1),
    week: lookup(7),
    month: lookup(30),
    year: lookup(365),
  };
  return summary;
}

/** Contribution stats per investment account. Returns null returnPct when
 *  data is insufficient rather than showing a misleading number. */
export function contributionStats(
  account: Account,
  transactions: Transaction[],
  snapshots: BalanceSnapshot[],
): ContributionStats {
  const txns = transactions
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalDeposits = txns.filter(isContribution).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalWithdrawals = txns.filter(isWithdrawal).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netContributions = totalDeposits - totalWithdrawals;
  const simpleGain = account.currentBalance - netContributions;

  const firstDate = txns[0]?.date;
  const hasHistory = txns.length > 0 && snapshots.length > 0;
  const returnPct =
    hasHistory && netContributions > 0 ? (simpleGain / netContributions) * 100 : null;

  const byMonth = new Map<string, number>();
  for (const t of txns.filter(isContribution)) {
    const m = t.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(t.amount));
  }
  const contributionsByMonth = [...byMonth.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const acctSnaps = snapshots
    .filter((s) => s.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const depositByDate = new Map<string, number>();
  for (const t of txns.filter((t) => isContribution(t) || isWithdrawal(t))) {
    const signed = isContribution(t) ? Math.abs(t.amount) : -Math.abs(t.amount);
    depositByDate.set(t.date, (depositByDate.get(t.date) ?? 0) + signed);
  }
  const series = acctSnaps.map((s) => {
    cum += depositByDate.get(s.date) ?? 0;
    return { date: s.date, value: s.balance, contributions: cum };
  });

  return {
    accountId: account.id,
    currentValue: account.currentBalance,
    totalDeposits,
    totalWithdrawals,
    netContributions,
    simpleGain,
    returnPct,
    contributionsByMonth,
    series,
  };
}

/** Roth IRA contributions for a tax year across all Roth accounts.
 *  Limit is configurable via ROTH_LIMITS env/JSON (see settings). */
export function rothContributions(
  accounts: Account[],
  transactions: Transaction[],
  taxYear: number,
) {
  const rothIds = new Set(accounts.filter((a) => a.type === "roth_ira").map((a) => a.id));
  const txns = transactions.filter(
    (t) => rothIds.has(t.accountId) && t.date.startsWith(String(taxYear)),
  );
  const deposits = txns.filter(isContribution).reduce((s, t) => s + Math.abs(t.amount), 0);
  const withdrawals = txns.filter(isWithdrawal).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { deposits, withdrawals, net: deposits - withdrawals };
}

export const DEFAULT_ROTH_LIMITS: Record<number, number> = {
  2024: 7000,
  2025: 7000,
  2026: 7500,
};

export function monthlyEquivalent(amount: number, frequency: string) {
  switch (frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    default:
      return amount;
  }
}
