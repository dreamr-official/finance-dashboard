import type { Account, Transaction } from "./types";
import { isActivityCashFlow, matchedActivityTransferIds } from "./activity";

export const PAGE_STEP = 100;

export interface TransactionFilters {
  accountId: string;
  type: string;
  month: string;
  from: string;
  to: string;
  q: string;
}

export interface TransactionMonthGroup {
  month: string;
  label: string;
  moneyIn: number;
  moneyOut: number;
  count: number;
  transactions: Transaction[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function stringValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseLimit(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return PAGE_STEP;
  const value = Number(raw);
  if (value <= 0) return PAGE_STEP;
  if (!Number.isFinite(value) || value >= 100000) return 100000;
  return Math.max(PAGE_STEP, Math.ceil(value / PAGE_STEP) * PAGE_STEP);
}

export function parseTransactionFilters(
  params: Record<string, string | string[] | undefined>,
): TransactionFilters {
  const month = stringValue(params.month);
  const from = stringValue(params.from);
  const to = stringValue(params.to);
  const validMonth =
    MONTH_PATTERN.test(month) && Number(month.slice(5, 7)) >= 1 && Number(month.slice(5, 7)) <= 12
      ? month
      : "";

  return {
    accountId: stringValue(params.account),
    type: stringValue(params.type),
    month: validMonth,
    from: validDate(from) ? from : "",
    to: validDate(to) ? to : "",
    q: stringValue(params.q).trim(),
  };
}

export function compareNewestFirst(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  const query = filters.q.toLowerCase();
  return transactions
    .filter((transaction) => {
      if (filters.accountId && transaction.accountId !== filters.accountId) return false;
      if (filters.type && transaction.type !== filters.type) return false;
      if (filters.month && !transaction.date.startsWith(filters.month)) return false;
      if (filters.from && transaction.date < filters.from) return false;
      if (filters.to && transaction.date > filters.to) return false;
      if (
        query &&
        !transaction.name.toLowerCase().includes(query) &&
        !(transaction.category ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    })
    .sort(compareNewestFirst);
}

export function groupByMonth(
  visible: Transaction[],
  all: Transaction[],
  accounts: Account[] = [],
  transferTransactions = all,
): TransactionMonthGroup[] {
  const groups = new Map<string, TransactionMonthGroup>();
  const matched = matchedActivityTransferIds(transferTransactions, accounts);
  for (const transaction of visible) {
    const month = transaction.date.slice(0, 7);
    if (!groups.has(month)) {
      groups.set(month, {
        month,
        label: new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T00:00:00.000Z`)),
        moneyIn: 0,
        moneyOut: 0,
        count: 0,
        transactions: [],
      });
    }
    groups.get(month)!.transactions.push(transaction);
  }

  for (const transaction of all) {
    const group = groups.get(transaction.date.slice(0, 7));
    if (!group) continue;
    group.count += 1;
    if (isActivityCashFlow(transaction, matched) && transaction.amount > 0) {
      group.moneyIn += transaction.amount;
    }
    if (isActivityCashFlow(transaction, matched) && transaction.amount < 0) {
      group.moneyOut += Math.abs(transaction.amount);
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    moneyIn: Math.round(group.moneyIn * 100) / 100,
    moneyOut: Math.round(group.moneyOut * 100) / 100,
  }));
}

export function withParams(
  path: string,
  current: Record<string, string>,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Chunk size must be a positive integer");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
