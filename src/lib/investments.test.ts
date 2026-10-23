import { describe, expect, it } from "vitest";
import { reconstructBalances } from "./backfill";
import { netWorthSeries } from "./finance";
import {
  convertPlaidInvestmentTransaction,
  investmentNoticeForError,
  isRecentIncomeDate,
  mapPlaidHoldingAssetType,
  mapPlaidInvestmentType,
} from "./investments";
import { fetchInvestmentTransactions } from "./integrations/plaid";
import type { Account } from "./types";

describe("Plaid investment transaction mapping", () => {
  it("fetches investment transactions until the reported total is reached", async () => {
    const fetchPage = async (offset: number) => ({
      total: 5,
      transactions: offset === 0 ? [1, 2, 3] : [4, 5],
    });
    await expect(fetchInvestmentTransactions(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
  });

  it("stops on an empty page before reaching the reported total", async () => {
    const offsets: number[] = [];
    const fetchPage = async (offset: number) => {
      offsets.push(offset);
      return {
        total: 10,
        transactions: offset === 0 ? [1, 2] : [],
      };
    };
    await expect(fetchInvestmentTransactions(fetchPage)).resolves.toEqual([1, 2]);
    expect(offsets).toEqual([0, 2]);
  });

  it("does not request another page once the total is reached", async () => {
    const offsets: number[] = [];
    const fetchPage = async (offset: number) => {
      offsets.push(offset);
      return { total: 2, transactions: [offset + 1, offset + 2] };
    };
    await expect(fetchInvestmentTransactions(fetchPage)).resolves.toEqual([1, 2]);
    expect(offsets).toEqual([0]);
  });

  it("maps contributions, dividends, and transfers by Plaid amount sign", () => {
    expect(mapPlaidInvestmentType("cash", "contribution")).toBe("deposit");
    expect(mapPlaidInvestmentType("cash", "dividend reinvestment")).toBe("dividend");
    expect(mapPlaidInvestmentType("transfer", undefined, 10)).toBe("transfer_out");
    expect(mapPlaidInvestmentType("transfer", undefined, -10)).toBe("transfer_in");
  });

  it("uses contribution names only for inbound Plaid transfers", () => {
    expect(
      mapPlaidInvestmentType(
        "transfer",
        "transfer",
        -500,
        "CONTRIBUTION CURRENT YEAR",
      ),
    ).toBe("deposit");
    expect(
      mapPlaidInvestmentType(
        "transfer",
        "transfer",
        500,
        "CONTRIBUTION CURRENT YEAR",
      ),
    ).toBe("transfer_out");
    expect(mapPlaidInvestmentType("buy", undefined, -500, "Contribution")).toBe("buy");
  });

  it("inverts the amount and prefixes investment transaction ids", () => {
    expect(
      convertPlaidInvestmentTransaction({
        investment_transaction_id: "investment-1",
        account_id: "account-1",
        date: "2026-01-02",
        name: "Contribution",
        amount: 42,
        type: "contribution",
      }),
    ).toMatchObject({
      providerTxnId: "inv:investment-1",
      amount: -42,
      suggestedType: "deposit",
    });
  });

  it.each([
    ["equity", "stock"],
    ["etf", "etf"],
    ["mutual fund", "mutual_fund"],
    ["fixed income", "bond"],
    ["cash", "cash"],
    ["cryptocurrency", "crypto"],
    ["derivative", "other"],
  ])("maps holding type %s", (source, expected) => {
    expect(mapPlaidHoldingAssetType(source)).toBe(expected);
  });
});

describe("investment notices and income notification window", () => {
  const today = new Date("2026-10-22T12:00:00.000Z");

  it("includes dates within seven days and excludes older or future rows", () => {
    expect(isRecentIncomeDate("2026-10-15", today)).toBe(true);
    expect(isRecentIncomeDate("2026-10-14", today)).toBe(false);
    expect(isRecentIncomeDate("2026-10-23", today)).toBe(false);
  });

  it("maps unavailable and preparing Plaid products to user notices", () => {
    expect(
      investmentNoticeForError({
        response: { data: { error_code: "ADDITIONAL_CONSENT_REQUIRED" } },
      }),
    ).toContain("Grant investment access");
    expect(
      investmentNoticeForError({
        response: { data: { error_code: "PRODUCT_NOT_READY" } },
      }),
    ).toContain("preparing");
    expect(
      investmentNoticeForError({
        response: { data: { error_code: "PRODUCT_NOT_ENABLED" } },
      }),
    ).toContain("Plaid plan");
    expect(investmentNoticeForError({ message: "Product is not enabled" })).toContain(
      "Plaid plan",
    );
  });
});

describe("balance reconstruction", () => {
  const today = new Date("2026-01-05T12:00:00.000Z");

  it("reverses same-day transaction totals and ignores pending rows", () => {
    expect(
      reconstructBalances(
        100,
        [
          { date: "2026-01-02", amount: 10, pending: false },
          { date: "2026-01-03", amount: 5, pending: false },
          { date: "2026-01-03", amount: 2, pending: false },
          { date: "2026-01-04", amount: -2, pending: false },
          { date: "2026-01-01", amount: 900, pending: true },
        ],
        today,
      ),
    ).toEqual([
      { date: "2026-01-02", balance: 95 },
      { date: "2026-01-03", balance: 102 },
      { date: "2026-01-04", balance: 100 },
    ]);
  });

  it("caps reconstruction to 730 days", () => {
    const earliest = new Date(today);
    earliest.setUTCDate(earliest.getUTCDate() - 1000);
    const rows = reconstructBalances(
      10,
      [{ date: earliest.toISOString().slice(0, 10), amount: 0, pending: false }],
      today,
    );
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - 730);
    expect(rows).toHaveLength(730);
    expect(rows[0].date).toBe(cutoff.toISOString().slice(0, 10));
  });
});

describe("net worth history before first snapshot", () => {
  it("uses the earliest snapshot before its date and current balance without history", () => {
    const account = (
      id: string,
      currentBalance: number,
      assetClass: Account["assetClass"] = "cash",
    ): Account => ({
      id,
      institutionId: "institution",
      name: id,
      type: "checking",
      assetClass,
      currency: "USD",
      currentBalance,
      lastSyncedAt: null,
      isManual: true,
      connectionStatus: "manual",
    });
    expect(
      netWorthSeries(
        [account("late", 100), account("early", 20), account("none", 30)],
        [
          { accountId: "early", date: "2026-01-01", balance: 10 },
          { accountId: "late", date: "2026-01-03", balance: 50 },
          { accountId: "late", date: "2026-01-05", balance: 80 },
          { accountId: "early", date: "2026-01-05", balance: 20 },
        ],
      ),
    ).toEqual([
      { date: "2026-01-01", value: 90 },
      { date: "2026-01-03", value: 90 },
      { date: "2026-01-05", value: 130 },
    ]);
  });
});
