import { describe, expect, it } from "vitest";
import { fundingDifferenceParts, reconcileInvestmentFunding } from "./reconcile";
import { buildTransferReport } from "./transfer-match";
import type { Account, Institution, Transaction } from "./types";

function account(
  id: string,
  institutionId: string,
  assetClass: Account["assetClass"],
  type: Account["type"],
): Account {
  return {
    id,
    institutionId,
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

function institution(id: string, name: string): Institution {
  return { id, name, provider: "manual" };
}

function transaction(
  id: string,
  accountId: string,
  date: string,
  amount: number,
  type: Transaction["type"],
  name: string,
  transferPairId?: string,
  category?: string,
): Transaction {
  return {
    id,
    accountId,
    date,
    amount,
    type,
    name,
    transferPairId,
    category,
    typeOverridden: false,
    pending: false,
  };
}

const today = "2026-10-23";

describe("reconcileInvestmentFunding", () => {
  const bank = account("checking", "bank", "cash", "checking");
  const fidelityRoth = account("fidelity-roth", "fidelity", "retirement", "roth_ira");
  const fidelity = institution("fidelity", "Fidelity");
  const baseAccounts = [bank, fidelityRoth];

  it("counts matched bank outflows and investment arrivals", () => {
    const txns = [
      transaction("bank-out", bank.id, "2026-10-20", -1500, "transfer_out", "Transfer", "p"),
      transaction(
        "roth-in",
        fidelityRoth.id,
        "2026-10-21",
        1500,
        "transfer_in",
        "Transfer",
        "p",
      ),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today });

    expect(summary).toMatchObject({
      institutionName: "Fidelity",
      sentFromBanks: 1500,
      arrived: 1500,
      difference: 0,
      perAccount: [{ account: fidelityRoth, arrived: 1500 }],
    });
  });

  it("scopes investment filters to one account and separates unassigned institution outflows", () => {
    const fidelityBrokerage = account("fidelity-brokerage", "fidelity", "investment", "brokerage");
    const accounts = [bank, fidelityRoth, fidelityBrokerage];
    const txns = [
      transaction("roth-out", bank.id, "2026-10-20", -1000, "transfer_out", "Transfer", "roth"),
      transaction(
        "roth-in",
        fidelityRoth.id,
        "2026-10-20",
        1000,
        "transfer_in",
        "Transfer",
        "roth",
      ),
      transaction(
        "brokerage-out",
        bank.id,
        "2026-10-20",
        -500,
        "transfer_out",
        "Transfer",
        "brokerage",
      ),
      transaction(
        "brokerage-in",
        fidelityBrokerage.id,
        "2026-10-20",
        500,
        "transfer_in",
        "Transfer",
        "brokerage",
      ),
      transaction(
        "unassigned",
        bank.id,
        "2026-10-22",
        -475,
        "transfer_out",
        "FID BKG SVC LLC MONEYLINE",
      ),
      transaction(
        "roth-unknown-source",
        fidelityRoth.id,
        "2026-10-01",
        200,
        "transfer_in",
        "Transfer from outside account",
      ),
      transaction(
        "brokerage-unknown-source",
        fidelityBrokerage.id,
        "2026-10-01",
        300,
        "transfer_in",
        "Transfer from outside account",
      ),
    ];
    const [summary] = reconcileInvestmentFunding(accounts, [fidelity], txns, {
      today,
      accountId: fidelityRoth.id,
    });

    expect(reconcileInvestmentFunding(accounts, [fidelity], txns, {
      today,
      accountId: fidelityRoth.id,
    })).toHaveLength(1);
    expect(summary).toMatchObject({
      institutionName: "Fidelity",
      sentFromBanks: 1000,
      arrived: 1200,
      difference: -200,
      perAccount: [{ account: fidelityRoth, arrived: 1200 }],
      missingArrival: [],
      missingSource: [{ transaction: txns[5], account: fidelityRoth, status: "needs_review" }],
      unassignedBankOutflows: { count: 1, total: 475 },
    });
    expect(fundingDifferenceParts(summary)).toEqual({ inTransit: 0, needsReview: 200 });
  });

  it("scopes cash filters to that bank's outflows and their investment arrivals", () => {
    const savings = account("savings", "bank", "cash", "savings");
    const fidelityBrokerage = account("fidelity-brokerage", "fidelity", "investment", "brokerage");
    const accounts = [bank, savings, fidelityRoth, fidelityBrokerage];
    const txns = [
      transaction("checking-out", bank.id, "2026-10-20", -1000, "transfer_out", "Transfer", "checking"),
      transaction(
        "checking-in",
        fidelityRoth.id,
        "2026-10-20",
        1000,
        "transfer_in",
        "Transfer",
        "checking",
      ),
      transaction("savings-out", savings.id, "2026-10-20", -500, "transfer_out", "Transfer", "savings"),
      transaction(
        "savings-in",
        fidelityBrokerage.id,
        "2026-10-20",
        500,
        "transfer_in",
        "Transfer",
        "savings",
      ),
      transaction(
        "checking-unmatched",
        bank.id,
        "2026-10-22",
        -475,
        "transfer_out",
        "Fidelity transfer",
      ),
      transaction(
        "roth-unknown-source",
        fidelityRoth.id,
        "2026-10-01",
        200,
        "transfer_in",
        "Transfer from outside account",
      ),
      transaction("withdrawal-out", fidelityRoth.id, "2026-10-20", -100, "transfer_out", "Transfer", "withdrawal"),
      transaction("withdrawal-in", bank.id, "2026-10-20", 100, "transfer_in", "Transfer", "withdrawal"),
    ];
    const [summary] = reconcileInvestmentFunding(accounts, [fidelity], txns, {
      today,
      accountId: bank.id,
    });

    expect(summary).toMatchObject({
      sentFromBanks: 1475,
      arrived: 1000,
      missingArrival: [{ transaction: txns[4], account: bank, status: "in_transit" }],
      missingSource: [],
      withdrawnToBanks: 0,
      arrivedInBanks: 0,
    });
    expect(summary.perAccount.find((item) => item.account.id === fidelityRoth.id)?.arrived).toBe(
      1000,
    );
    expect(fundingDifferenceParts(summary)).toEqual({ inTransit: 475, needsReview: 0 });
  });

  it.each([
    ["investment", "fidelity-roth"],
    ["cash", "checking"],
  ] as const)("keeps funding issues inside the filtered transfer report for a %s filter", (kind, accountId) => {
    const filteredAccounts = kind === "investment" ? baseAccounts : [bank, fidelityRoth];
    const txns = [
      transaction(
        "unmatched-out",
        bank.id,
        "2026-10-22",
        -250,
        "transfer_out",
        "Fidelity transfer",
      ),
      transaction(
        "unmatched-in",
        fidelityRoth.id,
        "2026-10-01",
        125,
        "transfer_in",
        "Transfer from outside account",
      ),
    ];
    const options = { today, from: "2026-10-01", to: "2026-10-23", accountId };
    const funding = reconcileInvestmentFunding(filteredAccounts, [fidelity], txns, options);
    const report = buildTransferReport(txns, filteredAccounts, options);
    const reportIssues = [...report.unmatchedOut, ...report.unmatchedIn];
    const reportIssuesById = new Map(reportIssues.map((issue) => [issue.transaction.id, issue]));
    const fundingIssues = funding.flatMap((group) => [
      ...group.missingArrival,
      ...group.missingSource,
    ]);

    for (const issue of fundingIssues) {
      const reportIssue = reportIssuesById.get(issue.transaction.id);
      expect(reportIssue).toBeDefined();
      expect(reportIssue?.status).toBe(
        issue.status === "in_transit" ? "pending" : "needs_review",
      );
    }

    const reviewAmount = fundingIssues
      .filter((issue) => issue.status === "needs_review")
      .reduce((sum, issue) => sum + Math.abs(issue.transaction.amount), 0);
    const transitAmount = fundingIssues
      .filter((issue) => issue.status === "in_transit")
      .reduce((sum, issue) => sum + Math.abs(issue.transaction.amount), 0);
    expect(reviewAmount).toBeLessThanOrEqual(report.summary.needsReview.total);
    expect(transitAmount).toBeLessThanOrEqual(report.summary.pending.total);
  });

  it("attributes Fidelity Moneyline outflows and distinguishes transit from review", () => {
    const txns = [
      transaction("recent", bank.id, "2026-10-22", -200, "transfer_out", "FID BKG SVC LLC MONEYLINE"),
      transaction("old", bank.id, "2026-10-10", -500, "transfer_out", "Fidelity brokerage transfer"),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today });

    expect(summary.sentFromBanks).toBe(700);
    expect(summary.missingArrival.map((item) => item.status)).toEqual([
      "in_transit",
      "needs_review",
    ]);
    expect(fundingDifferenceParts(summary)).toEqual({ inTransit: 200, needsReview: 500 });
  });

  it("excludes investment-to-investment transfers", () => {
    const robinhoodAccount = account("robinhood", "robinhood", "investment", "brokerage");
    const txns = [
      transaction(
        "fidelity-out",
        fidelityRoth.id,
        "2026-10-20",
        -300,
        "transfer_out",
        "Transfer",
        "portfolio",
      ),
      transaction(
        "robinhood-in",
        robinhoodAccount.id,
        "2026-10-20",
        300,
        "transfer_in",
        "Transfer",
        "portfolio",
      ),
    ];

    expect(
      reconcileInvestmentFunding(
        [...baseAccounts, robinhoodAccount],
        [fidelity, institution("robinhood", "Robinhood")],
        txns,
        { today },
      ),
    ).toEqual([]);
  });

  it("does not place P2P or card payments in the unknown destination bucket", () => {
    const txns = [
      transaction("zelle", bank.id, "2026-10-20", -100, "transfer_out", "Zelle to Alex"),
      transaction("card", bank.id, "2026-10-20", -200, "transfer_out", "Visa card payment"),
    ];

    expect(reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today })).toEqual([]);
  });

  it("excludes payroll deposits from missing-source arrivals", () => {
    const payroll = transaction(
      "payroll",
      fidelityRoth.id,
      "2026-10-20",
      1000,
      "deposit",
      "Payroll contribution",
    );
    const external = transaction(
      "external-in",
      fidelityRoth.id,
      "2026-10-20",
      250,
      "transfer_in",
      "Transfer from outside account",
    );

    const [summary] = reconcileInvestmentFunding(
      baseAccounts,
      [fidelity],
      [payroll, external],
      { today },
    );

    expect(summary.missingSource).toHaveLength(1);
    expect(summary.missingSource[0]).toMatchObject({
      transaction: external,
      status: "in_transit",
    });
  });

  it("rounds and sums amounts in integer cents", () => {
    const txns = [
      transaction("out-a", bank.id, "2026-10-20", -0.1, "transfer_out", "Transfer", "a"),
      transaction("in-a", fidelityRoth.id, "2026-10-20", 0.1, "transfer_in", "Transfer", "a"),
      transaction("out-b", bank.id, "2026-10-20", -0.2, "transfer_out", "Transfer", "b"),
      transaction("in-b", fidelityRoth.id, "2026-10-20", 0.2, "transfer_in", "Transfer", "b"),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today });

    expect(summary.sentFromBanks).toBe(0.3);
    expect(summary.arrived).toBe(0.3);
    expect(summary.difference).toBe(0);
  });

  it("filters sent and arrived totals by their respective leg dates", () => {
    const txns = [
      transaction("bank-out", bank.id, "2026-10-20", -300, "transfer_out", "Transfer", "p"),
      transaction(
        "roth-in",
        fidelityRoth.id,
        "2026-10-22",
        300,
        "transfer_in",
        "Transfer",
        "p",
      ),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, {
      today,
      from: "2026-10-22",
      to: "2026-10-22",
    });

    expect(summary.sentFromBanks).toBe(0);
    expect(summary.arrived).toBe(300);
    expect(summary.difference).toBe(-300);
    expect(fundingDifferenceParts(summary)).toEqual({ inTransit: 0, needsReview: 0 });
  });

  it("tracks reverse investment-to-bank transfers", () => {
    const txns = [
      transaction("roth-out", fidelityRoth.id, "2026-10-20", -250, "transfer_out", "Transfer", "p"),
      transaction("bank-in", bank.id, "2026-10-21", 250, "transfer_in", "Transfer", "p"),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today });

    expect(summary).toMatchObject({ withdrawnToBanks: 250, arrivedInBanks: 250 });
  });

  it("includes unmatched transfer outflows in an unknown destination bucket", () => {
    const txns = [
      transaction("unknown", bank.id, "2026-10-20", -125, "transfer_out", "Transfer to a new account"),
    ];
    const [summary] = reconcileInvestmentFunding(baseAccounts, [fidelity], txns, { today });

    expect(summary).toMatchObject({
      institutionId: null,
      institutionName: "Unknown destination",
      sentFromBanks: 125,
      difference: 125,
    });
  });
});
