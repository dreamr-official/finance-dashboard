import { matchTransfers } from "./transfer-match";
import type { Account, Transaction } from "./types";

export type ContributionSource =
  | "deposit"
  | "transfer_from_cash"
  | "transfer_unmatched"
  | "transfer_from_investment";

export interface ContributionEntry {
  transaction: Transaction;
  account: Account;
  amount: number;
  source:
    | ContributionSource
    | "withdrawal"
    | "transfer_to_cash"
    | "transfer_out_unmatched"
    | "other";
  fromAccount?: Account;
  toAccount?: Account;
}

const INVESTMENT_ASSET_CLASSES = new Set<Account["assetClass"]>([
  "investment",
  "retirement",
]);
const ROLLOVER_NAME = /rollover|acat|journal/i;

function entry(
  transaction: Transaction,
  account: Account,
  amount: number,
  source: ContributionEntry["source"],
  fromAccount?: Account,
  toAccount?: Account,
): ContributionEntry {
  return { transaction, account, amount, source, fromAccount, toAccount };
}

export function classifyInvestmentFlows(
  accounts: Account[],
  transactions: Transaction[],
): { counted: ContributionEntry[]; notCounted: ContributionEntry[] } {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const transfers = matchTransfers(transactions, accounts);
  const pairByTransaction = new Map<Transaction, (typeof transfers.pairs)[number]>();
  for (const pair of transfers.pairs) {
    pairByTransaction.set(pair.in, pair);
    pairByTransaction.set(pair.out, pair);
  }

  const counted: ContributionEntry[] = [];
  const notCounted: ContributionEntry[] = [];
  for (const transaction of transactions) {
    const account = accountsById.get(transaction.accountId);
    if (!account || !INVESTMENT_ASSET_CLASSES.has(account.assetClass)) continue;
    if (!Number.isFinite(transaction.amount)) continue;

    const pair = pairByTransaction.get(transaction);
    switch (transaction.type) {
      case "deposit":
        counted.push(entry(transaction, account, Math.abs(transaction.amount), "deposit"));
        break;
      case "withdrawal":
        counted.push(entry(transaction, account, -Math.abs(transaction.amount), "withdrawal"));
        break;
      case "transfer_in":
        if (pair && INVESTMENT_ASSET_CLASSES.has(pair.from.assetClass)) {
          notCounted.push(
            entry(
              transaction,
              account,
              Math.abs(transaction.amount),
              "transfer_from_investment",
              pair.from,
              pair.to,
            ),
          );
        } else if (pair) {
          counted.push(
            entry(
              transaction,
              account,
              Math.abs(transaction.amount),
              "transfer_from_cash",
              pair.from,
              pair.to,
            ),
          );
        } else if (ROLLOVER_NAME.test(transaction.name)) {
          notCounted.push(
            entry(transaction, account, Math.abs(transaction.amount), "transfer_unmatched"),
          );
        } else {
          counted.push(
            entry(transaction, account, Math.abs(transaction.amount), "transfer_unmatched"),
          );
        }
        break;
      case "transfer_out":
        if (pair && INVESTMENT_ASSET_CLASSES.has(pair.to.assetClass)) {
          notCounted.push(
            entry(
              transaction,
              account,
              -Math.abs(transaction.amount),
              "transfer_from_investment",
              pair.from,
              pair.to,
            ),
          );
        } else if (pair) {
          counted.push(
            entry(
              transaction,
              account,
              -Math.abs(transaction.amount),
              "transfer_to_cash",
              pair.from,
              pair.to,
            ),
          );
        } else if (ROLLOVER_NAME.test(transaction.name)) {
          notCounted.push(
            entry(transaction, account, -Math.abs(transaction.amount), "transfer_out_unmatched"),
          );
        } else {
          counted.push(
            entry(transaction, account, -Math.abs(transaction.amount), "transfer_out_unmatched"),
          );
        }
        break;
      case "other":
        if (transaction.amount > 0) {
          notCounted.push(
            entry(transaction, account, Math.abs(transaction.amount), "other"),
          );
        }
        break;
      default:
        break;
    }
  }

  return { counted, notCounted };
}

export function rothContributions(
  accounts: Account[],
  transactions: Transaction[],
  taxYear: number,
): { deposits: number; withdrawals: number } {
  const rothIds = new Set(
    accounts.filter((account) => account.type === "roth_ira").map((account) => account.id),
  );
  const { counted, notCounted } = classifyInvestmentFlows(accounts, transactions);
  const matchingYear = (transaction: Transaction) =>
    (transaction.taxYear ?? Number(transaction.date.slice(0, 4))) === taxYear;
  const rothCounted = counted.filter(
    (flow) => rothIds.has(flow.account.id) && matchingYear(flow.transaction),
  );
  const qualifyingTransfers = notCounted.filter(
    (flow) =>
      rothIds.has(flow.account.id) &&
      flow.source === "transfer_from_investment" &&
      flow.fromAccount?.assetClass !== "retirement" &&
      matchingYear(flow.transaction),
  );
  return {
    deposits:
      rothCounted
        .filter((flow) => flow.amount > 0)
        .reduce((total, flow) => total + flow.amount, 0) +
      qualifyingTransfers.reduce((total, flow) => total + flow.amount, 0),
    withdrawals: rothCounted
      .filter((flow) => flow.amount < 0)
      .reduce((total, flow) => total + Math.abs(flow.amount), 0),
  };
}
