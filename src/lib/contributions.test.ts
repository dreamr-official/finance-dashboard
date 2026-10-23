import { describe, expect, it } from "vitest";
import { classifyInvestmentFlows, rothContributions } from "./contributions";
import type { Account, Transaction } from "./types";

function account(
  id: string,
  assetClass: Account["assetClass"],
  type: Account["type"] = "brokerage",
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
  name: string = type,
  transferPairId?: string,
): Transaction {
  return {
    id,
    accountId,
    date: "2026-03-10",
    name,
    amount,
    type,
    transferPairId,
    typeOverridden: false,
    pending: false,
  };
}

describe("classifyInvestmentFlows", () => {
  it("counts deposits and matched transfers in from cash", () => {
    const accounts = [
      account("cash", "cash", "checking"),
      account("brokerage", "investment"),
    ];
    const deposit = transaction("deposit", "brokerage", "deposit", 150);
    const transferOut = transaction(
      "cash-out",
      "cash",
      "transfer_out",
      -500,
      "Transfer to brokerage",
      "pair-1",
    );
    const transferIn = transaction(
      "brokerage-in",
      "brokerage",
      "transfer_in",
      500,
      "Transfer from checking",
      "pair-1",
    );
    const result = classifyInvestmentFlows(accounts, [deposit, transferOut, transferIn]);

    expect(result.counted).toMatchObject([
      { transaction: deposit, account: accounts[1], amount: 150, source: "deposit" },
      {
        transaction: transferIn,
        account: accounts[1],
        amount: 500,
        source: "transfer_from_cash",
        fromAccount: accounts[0],
        toAccount: accounts[1],
      },
    ]);
  });

  it("does not count transfers from brokerage in portfolio contributions but counts them for Roth", () => {
    const accounts = [
      account("brokerage", "investment"),
      account("roth", "retirement", "roth_ira"),
    ];
    const out = transaction("brokerage-out", "brokerage", "transfer_out", -800, "Transfer", "p");
    const incoming = transaction("roth-in", "roth", "transfer_in", 800, "Transfer", "p");
    const flows = classifyInvestmentFlows(accounts, [out, incoming]);

    expect(flows.counted).toEqual([]);
    expect(flows.notCounted).toMatchObject([
      { transaction: out, source: "transfer_from_investment", amount: -800 },
      {
        transaction: incoming,
        source: "transfer_from_investment",
        amount: 800,
        fromAccount: accounts[0],
      },
    ]);
    expect(rothContributions(accounts, [out, incoming], 2026)).toEqual({
      deposits: 800,
      withdrawals: 0,
    });
  });

  it("excludes IRA-to-Roth transfers from Roth contribution totals", () => {
    const accounts = [
      account("ira", "retirement", "traditional_ira"),
      account("roth", "retirement", "roth_ira"),
    ];
    const out = transaction("ira-out", "ira", "transfer_out", -1200, "Transfer", "ira-roth");
    const incoming = transaction("roth-in", "roth", "transfer_in", 1200, "Transfer", "ira-roth");

    expect(classifyInvestmentFlows(accounts, [out, incoming]).counted).toEqual([]);
    expect(rothContributions(accounts, [out, incoming], 2026)).toEqual({
      deposits: 0,
      withdrawals: 0,
    });
  });

  it("counts unmatched transfers in except rollovers", () => {
    const accounts = [account("brokerage", "investment")];
    const incoming = transaction("incoming", "brokerage", "transfer_in", 400, "Transfer in");
    const rollover = transaction(
      "rollover",
      "brokerage",
      "transfer_in",
      600,
      "ROLLOVER from prior plan",
    );
    const result = classifyInvestmentFlows(accounts, [incoming, rollover]);

    expect(result.counted).toMatchObject([
      { transaction: incoming, amount: 400, source: "transfer_unmatched" },
    ]);
    expect(result.notCounted).toMatchObject([
      { transaction: rollover, amount: 600, source: "transfer_unmatched" },
    ]);
  });

  it("counts transfers out to cash as negative flows", () => {
    const accounts = [
      account("brokerage", "investment"),
      account("cash", "cash", "checking"),
    ];
    const outgoing = transaction("out", "brokerage", "transfer_out", -250, "Transfer", "p");
    const incoming = transaction("in", "cash", "transfer_in", 250, "Transfer", "p");
    const result = classifyInvestmentFlows(accounts, [outgoing, incoming]);

    expect(result.counted).toMatchObject([
      {
        transaction: outgoing,
        amount: -250,
        source: "transfer_to_cash",
        toAccount: accounts[1],
      },
    ]);
  });

  it("honors explicit Roth tax years and falls back to the transaction year", () => {
    const roth = account("roth", "retirement", "roth_ira");
    const explicit = {
      ...transaction("explicit", "roth", "deposit", 300),
      taxYear: 2025,
    };
    const fallback = transaction("fallback", "roth", "deposit", 200);

    expect(rothContributions([roth], [explicit, fallback], 2025).deposits).toBe(300);
    expect(rothContributions([roth], [explicit, fallback], 2026).deposits).toBe(200);
  });

  it("surfaces positive other transactions without counting them", () => {
    const accounts = [account("brokerage", "investment")];
    const other = transaction("other", "brokerage", "other", 90, "Unclassified cash flow");
    const result = classifyInvestmentFlows(accounts, [other]);

    expect(result.counted).toEqual([]);
    expect(result.notCounted).toMatchObject([
      { transaction: other, amount: 90, source: "other" },
    ]);
  });
});
