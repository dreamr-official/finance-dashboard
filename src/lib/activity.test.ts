import { describe, expect, it } from "vitest";
import { summarizeActivity, summarizeWhereItWent } from "./activity";
import type { Account, Transaction } from "./types";

function account(
  id: string,
  assetClass: Account["assetClass"],
  type: Account["type"],
): Account {
  return {
    id,
    institutionId: "institution",
    name: id,
    type,
    assetClass,
    currency: "USD",
    currentBalance: 0,
    lastSyncedAt: null,
    isManual: true,
    connectionStatus: "manual",
  };
}

function transaction(
  id: string,
  accountId: string,
  type: Transaction["type"],
  amount: number,
  options: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    accountId,
    date: "2026-10-10",
    name: id,
    amount,
    type,
    typeOverridden: false,
    pending: false,
    ...options,
  };
}

describe("filtered Activity summaries", () => {
  it("classifies paired transfers using all transactions before applying the account filter", () => {
    const accounts = [
      account("bank", "cash", "checking"),
      account("brokerage", "investment", "brokerage"),
      account("roth", "retirement", "roth_ira"),
    ];
    const bankOut = transaction("bank-out", "bank", "transfer_out", -500);
    const rothFromBank = transaction("roth-bank", "roth", "transfer_in", 500, {
      date: "2026-10-11",
    });
    const brokerageOut = transaction("brokerage-out", "brokerage", "transfer_out", -1000);
    const rothFromBrokerage = transaction(
      "roth-brokerage",
      "roth",
      "transfer_in",
      1000,
    );
    const all = [bankOut, rothFromBank, brokerageOut, rothFromBrokerage];

    expect(summarizeActivity([rothFromBank, rothFromBrokerage], accounts, all).contributions)
      .toBe(500);
  });

  it("excludes pending activity, nets categorized refunds, and ignores matched loan transfers", () => {
    const accounts = [
      account("checking", "cash", "checking"),
      account("loan", "liability", "loan"),
    ];
    const groceries = transaction("groceries", "checking", "expense", -200, {
      category: "GROCERIES",
    });
    const refund = transaction("refund", "checking", "income", 50, {
      category: "GROCERIES",
    });
    const pending = transaction("pending", "checking", "expense", -75, {
      category: "DINING",
      pending: true,
    });
    const loanPayment = transaction("loan-payment", "checking", "expense", -100, {
      category: "LOAN_PAYMENTS",
      name: "Loan payment",
    });
    const loanArrival = transaction("loan-arrival", "loan", "transfer_in", 100, {
      category: "LOAN_PAYMENTS",
      name: "Loan payment",
    });
    const all = [groceries, refund, pending, loanPayment, loanArrival];

    expect(summarizeActivity(all, accounts, all)).toMatchObject({
      moneyIn: 0,
      moneyOut: 200,
    });
    expect(summarizeWhereItWent(all, all, accounts)).toEqual([["Groceries", 150]]);
  });

  it("renders raw Plaid category keys as readable labels", () => {
    const other = account("other", "other", "other");
    const charge = transaction("charge", "other", "expense", -80, {
      category: "LOAN_PAYMENTS",
    });

    expect(summarizeWhereItWent([charge], [charge], [other])).toEqual([
      ["Loan Payments", 80],
    ]);
  });

  it("keeps income categories in Money in instead of treating them as refunds", () => {
    const checking = account("checking", "cash", "checking");
    const payroll = transaction("payroll", "checking", "income", 1000, {
      category: "INCOME",
    });

    expect(summarizeActivity([payroll], [checking])).toMatchObject({
      moneyIn: 1000,
      moneyOut: 0,
    });
    expect(summarizeWhereItWent([payroll], [payroll], [checking])).toEqual([]);
  });
});
