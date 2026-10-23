import { describe, expect, it } from "vitest";
import { fundingDifferenceParts, reconcileInvestmentFunding } from "./reconcile";
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
