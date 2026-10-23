import {
  Account,
  BalanceSnapshot,
  NetWorthSummary,
  Transaction,
} from "./types";
export { rothContributions } from "./contributions";

export function isLiability(a: Account) {
  return a.assetClass === "liability" || a.currentBalance < 0;
}

export function isWithdrawal(t: Transaction) {
  return t.type === "withdrawal";
}

export function computeNetWorth(accounts: Account[]): NetWorthSummary {
  const sum = (xs: Account[]) => xs.reduce((s, a) => s + a.currentBalance, 0);
  const assets = sum(accounts.filter((a) => !isLiability(a)));
  const liabilities = -sum(accounts.filter(isLiability));
  const cash = sum(accounts.filter((a) => a.assetClass === "cash"));
  const investments = sum(
    accounts.filter((a) => a.assetClass === "investment" || a.assetClass === "retirement"),
  );
  return {
    netWorth: assets - liabilities,
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
  today?: string,
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
  const series = dates.map((d) => {
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
  if (today && accounts.length > 0 && (!dates.length || today > dates[dates.length - 1])) {
    series.push({
      date: today,
      value: accounts.reduce((total, account) => total + account.currentBalance, 0),
    });
  }
  return series;
}

export interface AccountChange {
  account: Account;
  start: number | null;
  end: number;
  change: number | null;
  pct: number | null;
  isNew: boolean;
  moneyAdded: number | null;
  marketChange: number | null;
}

const MONEY_ADDED_TYPES = new Set<Transaction["type"]>([
  "deposit",
  "withdrawal",
  "transfer_in",
  "transfer_out",
  "income",
  "expense",
  "other",
]);

function roundCents(value: number) {
  const rounded = Number(value.toFixed(2));
  return rounded === 0 ? 0 : rounded;
}

export function accountChanges(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transactions: Transaction[],
  today: string,
  days: number,
): AccountChange[] {
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const snapshotByAccount = new Map<string, BalanceSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot.date > cutoffDate) continue;
    const previous = snapshotByAccount.get(snapshot.accountId);
    if (!previous || snapshot.date > previous.date) {
      snapshotByAccount.set(snapshot.accountId, snapshot);
    }
  }
  const transactionsByAccount = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const accountTransactions = transactionsByAccount.get(transaction.accountId) ?? [];
    accountTransactions.push(transaction);
    transactionsByAccount.set(transaction.accountId, accountTransactions);
  }
  return accounts
    .map((account): AccountChange => {
      const startSnapshot = snapshotByAccount.get(account.id) ?? null;
      const start = startSnapshot?.balance ?? null;
      const change = start === null ? null : account.currentBalance - start;
      let moneyAdded: number | null = null;
      let marketChange: number | null = null;
      if (
        startSnapshot &&
        change !== null &&
        (account.assetClass === "investment" || account.assetClass === "retirement")
      ) {
        const added = (transactionsByAccount.get(account.id) ?? [])
          .filter(
            (transaction) =>
              !transaction.pending &&
              transaction.date > startSnapshot.date &&
              transaction.date <= today &&
              MONEY_ADDED_TYPES.has(transaction.type),
          )
          .reduce((total, transaction) => total + transaction.amount, 0);
        moneyAdded = roundCents(added);
        marketChange = roundCents(change - moneyAdded);
      }
      return {
        account,
        start,
        end: account.currentBalance,
        change,
        pct: start === null || start === 0 ? null : (change ?? 0) / Math.abs(start),
        isNew: start === null,
        moneyAdded,
        marketChange,
      };
    })
    .sort(
      (left, right) =>
        Number(left.isNew) - Number(right.isNew) ||
        Math.abs(right.change ?? 0) - Math.abs(left.change ?? 0) ||
        left.account.name.localeCompare(right.account.name),
    );
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
