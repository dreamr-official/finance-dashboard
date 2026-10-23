import { describe, expect, it } from "vitest";
import { summarizeActivity } from "./activity";
import { classifyType, normalizeTransactionAmount } from "./transactions";
import { buildTransferLegs } from "./transfers";
import { convertPlaidTransaction, plaidAccountType } from "./integrations/plaid";
import {
  computeNetWorth,
  netWorthSeries,
  rothContributions,
  isWithdrawal,
} from "./finance";
import type { Account, Transaction } from "./types";

function account(
  id: string,
  currentBalance: number,
  assetClass: Account["assetClass"] = "cash",
  type: Account["type"] = "checking",
): Account {
  return {
    id,
    institutionId: "institution",
    name: id,
    type,
    assetClass,
    currency: "USD",
    currentBalance,
    lastSyncedAt: null,
    isManual: true,
    connectionStatus: "manual",
  };
}

function transaction(
  accountId: string,
  date: string,
  amount: number,
  type: Transaction["type"],
): Transaction {
  return {
    id: `${accountId}-${date}-${type}`,
    accountId,
    date,
    name: type,
    amount,
    type,
    typeOverridden: false,
    pending: false,
  };
}

describe("signed net worth", () => {
  it("sums account balances consistently and derives liability display from signed balances", () => {
    const summary = computeNetWorth([
      account("cash", 100),
      account("negative-cash", -20),
      account("investment", 200, "investment", "brokerage"),
      account("overpaid-card", 20, "liability", "credit_card"),
      account("loan", -100, "liability", "loan"),
    ]);

    expect(summary).toMatchObject({
      netWorth: 200,
      assets: 280,
      liabilities: 80,
      cash: 80,
      investments: 200,
    });
  });

  it("starts accounts with history at zero before their first snapshot and adds signed balances", () => {
    expect(
      netWorthSeries(
        [
          account("cash", 100),
          account("liability", 20, "liability", "credit_card"),
          account("no-history", 30),
        ],
        [
          { accountId: "cash", date: "2026-01-01", balance: 10 },
          { accountId: "cash", date: "2026-01-05", balance: 50 },
          { accountId: "liability", date: "2026-01-03", balance: -20 },
          { accountId: "liability", date: "2026-01-05", balance: 10 },
        ],
      ),
    ).toEqual([
      { date: "2026-01-01", value: 40 },
      { date: "2026-01-03", value: 20 },
      { date: "2026-01-05", value: 90 },
    ]);
  });
});

describe("Roth contributions", () => {
  it("counts gross deposits separately from withdrawals and excludes fees", () => {
    const result = rothContributions(
      [
        account("roth", 0, "retirement", "roth_ira"),
        account("cash", 0),
      ],
      [
        transaction("roth", "2026-02-01", 2500, "deposit"),
        transaction("roth", "2026-03-01", -800, "withdrawal"),
        transaction("roth", "2026-03-02", -50, "fee"),
        transaction("cash", "2026-03-03", 1000, "deposit"),
        transaction("roth", "2025-12-31", 500, "deposit"),
      ],
      2026,
    );

    expect(result).toEqual({ deposits: 2500, withdrawals: 800 });
    expect(isWithdrawal(transaction("roth", "2026-03-02", -50, "fee"))).toBe(false);
  });
});

describe("Plaid account mapping", () => {
  it.each<[string, string, string]>([
    ["depository", "checking", "checking"],
    ["depository", "savings", "savings"],
    ["credit", "credit card", "credit_card"],
    ["investment", "ira", "traditional_ira"],
    ["investment", "traditional ira", "traditional_ira"],
    ["investment", "roth ira", "roth_ira"],
    ["investment", "401k", "401k"],
    ["loan", "student", "loan"],
  ])("maps %s/%s to %s", (type, subtype, expected) => {
    expect(plaidAccountType(type, subtype)).toBe(expected);
  });
});

describe("Plaid transaction conversion", () => {
  const transaction = (primary: string) =>
    convertPlaidTransaction({
      transaction_id: "txn-1",
      account_id: "acct-1",
      date: "2026-01-02",
      name: "Example",
      amount: 12.5,
      personal_finance_category: { primary },
    });

  it("inverts Plaid's amount sign", () => {
    expect(transaction("FOOD_AND_DRINK").amount).toBe(-12.5);
  });

  it("suggests app transfer types for transfer categories", () => {
    expect(transaction("TRANSFER_IN").suggestedType).toBe("transfer_in");
    expect(transaction("TRANSFER_OUT").suggestedType).toBe("transfer_out");
  });

  it("leaves non-transfer suggestions undefined", () => {
    expect(transaction("INCOME").suggestedType).toBeUndefined();
  });
});

describe("classifyType", () => {
  it.each<[string, number]>([
    ["deposit", 100],
    ["employer contribution", 100],
    ["deposit", -100],
    ["transfer in", 100],
    ["transfer out", -100],
  ])("never infers a deposit for %s", (name, amount) => {
    expect(classifyType(name, amount)).not.toBe("deposit");
  });
});

describe("normalizeTransactionAmount", () => {
  it.each([
    ["deposit", -50, 50],
    ["income", -50, 50],
    ["dividend", -50, 50],
    ["interest", -50, 50],
    ["transfer_in", -50, 50],
    ["sell", -50, 50],
    ["withdrawal", 50, -50],
    ["expense", 50, -50],
    ["fee", 50, -50],
    ["transfer_out", 50, -50],
    ["buy", 50, -50],
    ["other", -50, -50],
  ])("normalizes %s", (type, amount, expected) => {
    expect(normalizeTransactionAmount(amount, type)).toBe(expected);
  });
});

describe("buildTransferLegs", () => {
  it("builds paired signed transfer rows", () => {
    const legs = buildTransferLegs(
      {
        fromAccountId: "account-a",
        toAccountId: "account-b",
        amount: 25,
        date: "2026-03-01",
        note: "  Rent split  ",
      },
      "pair-1",
    );

    expect(legs).toEqual([
      {
        account_id: "account-a",
        date: "2026-03-01",
        name: "Rent split",
        amount: -25,
        type: "transfer_out",
        transfer_pair_id: "pair-1",
      },
      {
        account_id: "account-b",
        date: "2026-03-01",
        name: "Rent split",
        amount: 25,
        type: "transfer_in",
        transfer_pair_id: "pair-1",
      },
    ]);
  });
});

describe("summarizeActivity", () => {
  it("excludes transfers from in/out and counts only investment deposits", () => {
    const account = (id: string, assetClass: Account["assetClass"]): Account => ({
      id,
      institutionId: "institution",
      name: id,
      type: "other",
      assetClass,
      currency: "USD",
      currentBalance: 0,
      lastSyncedAt: null,
      isManual: true,
      connectionStatus: "manual",
    });
    const transaction = (
      id: string,
      accountId: string,
      amount: number,
      type: Transaction["type"],
    ): Transaction => ({
      id,
      accountId,
      date: "2026-03-01",
      name: type,
      amount,
      type,
      typeOverridden: false,
      pending: false,
    });
    const accounts = [
      account("checking", "cash"),
      account("brokerage", "investment"),
      account("retirement", "retirement"),
    ];
    const transactions = [
      transaction("1", "brokerage", 200, "deposit"),
      transaction("2", "retirement", 50, "transfer_in"),
      transaction("3", "checking", -50, "transfer_out"),
      transaction("4", "checking", -20, "expense"),
      transaction("5", "checking", 10, "deposit"),
      transaction("6", "retirement", -5, "withdrawal"),
      transaction("7", "checking", 30, "income"),
    ];

    expect(summarizeActivity(transactions, accounts)).toEqual({
      moneyIn: 240,
      moneyOut: 25,
      contributions: 200,
    });
  });
});
