import type { TransactionType } from "./types";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  expense: "Expense",
  income: "Income",
  other: "Other",
};

export function transactionCountLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "transaction" : "transactions"}`;
}

export function classifyType(name: string, amount: number): string {
  if (amount > 0 && /dividend/i.test(name)) return "dividend";
  if (amount > 0 && /interest/i.test(name)) return "interest";
  if (/transfer|xfer|zelle|venmo/i.test(name)) {
    return amount >= 0 ? "transfer_in" : "transfer_out";
  }
  return amount >= 0 ? "income" : "expense";
}

export function normalizeTransactionAmount(amount: number, type: string): number {
  if (
    ["deposit", "income", "dividend", "interest", "transfer_in", "sell"].includes(type)
  ) {
    return Math.abs(amount);
  }
  if (
    ["withdrawal", "expense", "fee", "transfer_out", "buy"].includes(type)
  ) {
    return -Math.abs(amount);
  }
  return amount;
}
