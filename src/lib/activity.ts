import type { Account, Transaction } from "./types";
import { classifyInvestmentFlows } from "./contributions";
import { matchTransfers } from "./transfer-match";

export function isSpendingCategory(category?: string | null) {
  const normalized = category?.trim().toUpperCase();
  return Boolean(normalized && !["INCOME", "TRANSFER_IN", "TRANSFER_OUT"].includes(normalized));
}

export function matchedActivityTransferIds(
  transactions: Transaction[],
  accounts: Account[],
) {
  const report = matchTransfers(transactions, accounts);
  return new Set(report.pairs.flatMap((pair) => [pair.out.id, pair.in.id]));
}

export function isActivityCashFlow(
  transaction: Transaction,
  matchedTransferIds: Set<string>,
) {
  return (
    !transaction.pending &&
    transaction.type !== "buy" &&
    transaction.type !== "sell" &&
    !matchedTransferIds.has(transaction.id)
  );
}

export function summarizeActivity(
  transactions: Transaction[],
  accounts: Account[],
  allTransactions = transactions,
) {
  const matched = matchedActivityTransferIds(allTransactions, accounts);
  const summary = transactions.reduce(
    (summary, transaction) => {
      if (!isActivityCashFlow(transaction, matched)) return summary;
      if (transaction.amount > 0 && !isSpendingCategory(transaction.category)) {
        if (transaction.type === "interest" || transaction.type === "dividend") {
          summary.interestAndDividends += transaction.amount;
        } else {
          summary.moneyIn += transaction.amount;
        }
      } else if (
        transaction.amount > 0 &&
        (transaction.type === "interest" || transaction.type === "dividend")
      ) {
        summary.interestAndDividends += transaction.amount;
      }
      if (transaction.amount < 0) {
        summary.moneyOut += Math.abs(transaction.amount);
      }
      return summary;
    },
    { moneyIn: 0, moneyOut: 0, interestAndDividends: 0, contributions: 0 },
  );
  const visibleIds = new Set(transactions.map((transaction) => transaction.id));
  const flows = classifyInvestmentFlows(accounts, allTransactions).counted.filter((flow) =>
    visibleIds.has(flow.transaction.id),
  );
  summary.contributions = flows.reduce(
    (sum, flow) => sum + Math.max(0, flow.amount),
    0,
  );
  summary.moneyIn = Math.round(summary.moneyIn * 100) / 100;
  summary.moneyOut = Math.round(summary.moneyOut * 100) / 100;
  summary.interestAndDividends = Math.round(summary.interestAndDividends * 100) / 100;
  return summary;
}

export function summarizeWhereItWent(
  transactions: Transaction[],
  allTransactions: Transaction[],
  accounts: Account[],
) {
  const matched = matchedActivityTransferIds(allTransactions, accounts);
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.pending ||
      matched.has(transaction.id) ||
      (transaction.type !== "expense" &&
        transaction.type !== "fee" &&
        !(transaction.amount > 0))
    ) {
      continue;
    }
    if (transaction.amount > 0 && !isSpendingCategory(transaction.category)) continue;
    const amount = transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
    const rawCategory = transaction.category?.trim() || "Uncategorized";
    const category = /^[A-Z0-9_]+$/.test(rawCategory)
      ? rawCategory
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
      : rawCategory;
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }
  return [...totals]
    .map(([category, amount]) => [category, Math.round(amount * 100) / 100] as const)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);
}
