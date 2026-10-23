import {
  Account,
  BalanceSnapshot,
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
  return t.type === "withdrawal";
}

export function computeNetWorth(accounts: Account[]): NetWorthSummary {
  const sum = (xs: Account[]) => xs.reduce((s, a) => s + a.currentBalance, 0);
  const assets = sum(accounts.filter((a) => a.assetClass !== "liability"));
  const liabilities = -sum(accounts.filter((a) => a.assetClass === "liability"));
  const cash = sum(accounts.filter((a) => a.assetClass === "cash"));
  const investments = sum(
    accounts.filter((a) => a.assetClass === "investment" || a.assetClass === "retirement"),
  );
  return {
    netWorth: sum(accounts),
    assets,
    liabilities,
    cash,
    investments,
    change: { day: null, week: null, month: null, year: null },
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
  for (const arr of byAccount.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }
  const dates = [...new Set(snapshots.map((s) => s.date))].sort();
  const last: Record<string, number> = {};
  for (const a of accounts) last[a.id] = a.currentBalance;
  return dates.map((d) => {
    let total = 0;
    for (const a of accounts) {
      const snaps = byAccount.get(a.id) ?? [];
      let v = snaps.length ? snaps[0].balance : last[a.id];
      for (const snapshot of snaps) {
        if (snapshot.date > d) break;
        v = snapshot.balance;
      }
      total += v;
    }
    return { date: d, value: total };
  });
}

export function applyNetWorthChange(
  summary: NetWorthSummary,
  series: { date: string; value: number }[],
): NetWorthSummary {
  if (series.length < 2) {
    summary.change = { day: null, week: null, month: null, year: null };
    return summary;
  }
  const now = series[series.length - 1].value;
  const lookup = (days: number) => {
    const cutoff = new Date(series[series.length - 1].date);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const prior = [...series].reverse().find((p) => new Date(p.date) <= cutoff);
    return prior ? now - prior.value : null;
  };
  summary.change = {
    day: lookup(1),
    week: lookup(7),
    month: lookup(30),
    year: lookup(365),
  };
  return summary;
}

/** Roth IRA contributions and withdrawals for a tax year across Roth accounts. */
export function rothContributions(
  accounts: Account[],
  transactions: Transaction[],
  taxYear: number,
) {
  const rothIds = new Set(accounts.filter((a) => a.type === "roth_ira").map((a) => a.id));
  const txns = transactions.filter(
    (t) =>
      rothIds.has(t.accountId) &&
      (t.taxYear ?? Number(t.date.slice(0, 4))) === taxYear,
  );
  const deposits = txns.filter(isContribution).reduce((s, t) => s + Math.abs(t.amount), 0);
  const withdrawals = txns.filter(isWithdrawal).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { deposits, withdrawals };
}

export const DEFAULT_ROTH_LIMITS: Record<number, number> = {
  2024: 7000,
  2025: 7000,
  2026: 7500,
  2027: 7500,
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
