import { describe, expect, it } from "vitest";
import {
  assetClassSlices,
  capSlices,
  groupHoldingsByAssetType,
  groupHoldingsBySymbol,
  holdingsWithShare,
  toSlices,
} from "./holdings";
import type { Account, Holding } from "./types";

const holding = (overrides: Partial<Holding> = {}): Holding => ({
  id: "holding",
  accountId: "account-1",
  symbol: "VOO",
  name: "Vanguard S&P 500",
  quantity: 2,
  price: 100,
  value: 200,
  costBasis: 180,
  assetType: "etf",
  ...overrides,
});

const account = (overrides: Partial<Account> = {}): Account => ({
  id: "account-1",
  institutionId: "institution",
  name: "Test account",
  type: "checking",
  assetClass: "cash",
  currency: "USD",
  currentBalance: 100,
  lastSyncedAt: null,
  isManual: true,
  connectionStatus: "manual",
  ...overrides,
});

describe("toSlices", () => {
  it("drops non-positive values, sorts by value, and calculates shares", () => {
    const slices = toSlices([
      { key: "small", label: "Small", value: 25 },
      { key: "negative", label: "Negative", value: -1 },
      { key: "large", label: "Large", value: 75 },
      { key: "zero", label: "Zero", value: 0 },
      { key: "nan", label: "NaN", value: Number.NaN },
      { key: "infinity", label: "Infinity", value: Number.POSITIVE_INFINITY },
    ]);
    expect(slices.map(({ key }) => key)).toEqual(["large", "small"]);
    expect(slices.map(({ pct }) => pct)).toEqual([75, 25]);
    expect(slices.reduce((sum, slice) => sum + slice.pct, 0)).toBeCloseTo(100);
  });

  it("returns no slices for empty or all-zero input", () => {
    expect(toSlices([])).toEqual([]);
    expect(toSlices([{ key: "zero", label: "Zero", value: 0 }])).toEqual([]);
  });
});

describe("capSlices", () => {
  const slices = Array.from({ length: 7 }, (_, index) => ({
    key: String(index),
    label: `Slice ${index}`,
    value: (index + 1) * 10,
    pct: (index + 1) * 2,
  }));

  it("returns the original slices when within the limit", () => {
    const uncapped = slices.slice(0, 6);
    expect(capSlices(uncapped)).toBe(uncapped);
  });

  it("merges the tail into Other", () => {
    expect(capSlices(slices)).toEqual([
      ...slices.slice(0, 5),
      { key: "__other", label: "Other", value: 130, pct: 26 },
    ]);
  });
});

describe("holding aggregations", () => {
  it("groups case-insensitive symbols across accounts and totals quantity, value, and cost basis", () => {
    expect(
      groupHoldingsBySymbol([
        holding({ id: "one", symbol: "voo", quantity: 2, value: 200, costBasis: 180 }),
        holding({
          id: "two",
          accountId: "account-2",
          symbol: "VOO",
          quantity: 3,
          value: 300,
          costBasis: 250,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        key: "VOO",
        symbol: "VOO",
        quantity: 5,
        value: 500,
        pct: 100,
        costBasis: 430,
        accountIds: ["account-1", "account-2"],
      }),
    ]);
  });

  it("omits cost basis if any holding in the symbol group lacks it", () => {
    const [group] = groupHoldingsBySymbol([
      holding({ costBasis: 180 }),
      holding({ id: "two", costBasis: undefined }),
    ]);
    expect(group).not.toHaveProperty("costBasis");
  });

  it("labels asset types and computes percentages for holdings", () => {
    expect(
      groupHoldingsByAssetType([
        holding({ value: 300, assetType: "etf" }),
        holding({ id: "two", value: 100, assetType: "stock" }),
      ]),
    ).toEqual([
      { key: "etf", label: "ETFs", value: 300, pct: 75 },
      { key: "stock", label: "Stocks", value: 100, pct: 25 },
    ]);
    expect(
      holdingsWithShare([
        holding({ id: "small", value: 25 }),
        holding({ id: "large", value: 75 }),
        holding({ id: "negative", value: -1 }),
      ]),
    ).toMatchObject([
      { id: "large", value: 75, pct: 75 },
      { id: "small", value: 25, pct: 25 },
    ]);
  });
});

describe("assetClassSlices", () => {
  it("excludes liabilities and maps unknown asset classes to Other assets", () => {
    expect(
      assetClassSlices([
        account({ id: "cash", assetClass: "cash", currentBalance: 100 }),
        account({ id: "investment", assetClass: "investment", currentBalance: 200 }),
        account({ id: "retirement", assetClass: "retirement", currentBalance: 300 }),
        account({ id: "other", assetClass: "unexpected" as Account["assetClass"], currentBalance: 50 }),
        account({ id: "credit", type: "credit_card", assetClass: "liability", currentBalance: -20 }),
        account({ id: "loan", type: "loan", assetClass: "other", currentBalance: -30 }),
      ]),
    ).toEqual([
      { key: "retirement", label: "Retirement", value: 300, pct: (300 / 650) * 100 },
      { key: "investment", label: "Investments", value: 200, pct: (200 / 650) * 100 },
      { key: "cash", label: "Cash", value: 100, pct: (100 / 650) * 100 },
      { key: "other", label: "Other assets", value: 50, pct: (50 / 650) * 100 },
    ]);
  });
});
