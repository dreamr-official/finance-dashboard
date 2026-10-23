import type { Account, Transaction } from "./types";

export function summarizeActivity(transactions: Transaction[], accounts: Account[]) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return transactions.reduce(
    (summary, transaction) => {
      if (transaction.type === "buy" || transaction.type === "sell") return summary;
      if (transaction.amount > 0 && transaction.type !== "transfer_in") {
        summary.moneyIn += transaction.amount;
      }
      if (transaction.amount < 0 && transaction.type !== "transfer_out") {
        summary.moneyOut += Math.abs(transaction.amount);
      }
      const account = accountById.get(transaction.accountId);
      if (
        transaction.type === "deposit" &&
        (account?.assetClass === "investment" || account?.assetClass === "retirement")
      ) {
        summary.contributions += Math.abs(transaction.amount);
      }
      return summary;
    },
    { moneyIn: 0, moneyOut: 0, contributions: 0 },
  );
}
