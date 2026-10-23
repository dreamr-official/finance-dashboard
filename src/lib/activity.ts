import type { Account, Transaction } from "./types";
import { classifyInvestmentFlows } from "./contributions";
import { matchTransfers } from "./transfer-match";

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
      if (transaction.amount > 0) {
        summary.moneyIn += transaction.amount;
      }
      if (transaction.amount < 0) {
        summary.moneyOut += Math.abs(transaction.amount);
      }
      return summary;
    },
    { moneyIn: 0, moneyOut: 0, contributions: 0 },
  );
  const flows = classifyInvestmentFlows(accounts, transactions);
  summary.contributions = flows.counted.reduce(
    (sum, flow) => sum + Math.max(0, flow.amount),
    0,
  );
  summary.moneyIn = Math.round(summary.moneyIn * 100) / 100;
  summary.moneyOut = Math.round(summary.moneyOut * 100) / 100;
  return summary;
}
