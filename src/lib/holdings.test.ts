import { describe, expect, it } from "vitest";
import {
  assetClassSlices,
  canManageHoldings,
  capSlices,
  groupHoldingsByAssetType,
  groupHoldingsBySymbol,
  holdingCreateSchema,
  holdingPatchSchema,
  holdingsBalanceGap,
  holdingsWithShare,
  toHoldingInsert,
  toHoldingUpdate,
  toSlices,
} from "./holdings";
import type { Account, Holding } from "./types";

const now = new Date("2026-10-22T12:00:00Z");

describe("holdingCreateSchema", () => {
  it("uppercases and trims the symbol and defaults asset_type", () => {
    const parsed = holdingCreateSchema.parse({ symbol: " vti ", quantity: 2, price: 10 });
    expect(parsed.symbol).toBe("VTI");
    expect(parsed.asset_type).toBe("other");
  });

  it("rejects non-positive quantity, negative price, empty symbol, bad asset_type", () => {
    expect(holdingCreateSchema.safeParse({ symbol: "A", quantity: 0, price: 1 }).success).toBe(false);
    expect(holdingCreateSchema.safeParse({ symbol: "A", quantity: 1, price: -1 }).success).toBe(false);
    expect(holdingCreateSchema.safeParse({ symbol: " ", quantity: 1, price: 1 }).success).toBe(false);
    expect(
      holdingCreateSchema.safeParse({ symbol: "A", quantity: 1, price: 1, asset_type: "reit" }).success,
    ).toBe(false);
  });

  it("allows a zero price", () => {
    expect(holdingCreateSchema.safeParse({ symbol: "A", quantity: 1, price: 0 }).success).toBe(true);
  });
});

describe("toHoldingInsert", () => {
  it("defaults value to quantity × price rounded to cents and name to symbol", () => {
    const row = toHoldingInsert(
      holdingCreateSchema.parse({ symbol: "fxaix", quantity: 1.2345, price: 201.11 }),
      now,
    );
    expect(row).toEqual({
      symbol: "FXAIX",
      name: "FXAIX",
      quantity: 1.2345,
      price: 201.11,
      value: 248.27,
      cost_basis: null,
      asset_type: "other",
      as_of: now.toISOString(),
    });
  });

  it("keeps an explicit value and cost basis", () => {
    const row = toHoldingInsert(
      holdingCreateSchema.parse({
        symbol: "VTI",
        name: "Vanguard Total",
        quantity: 2,
        price: 10,
        value: 25,
        cost_basis: 18,
        asset_type: "etf",
      }),
      now,
    );
    expect(row.value).toBe(25);
    expect(row.cost_basis).toBe(18);
    expect(row.asset_type).toBe("etf");
    expect(row.name).toBe("Vanguard Total");
  });
});

describe("toHoldingUpdate", () => {
  const existing = { quantity: 10, price: 5 };

  it("recomputes value from merged quantity and price", () => {
    expect(toHoldingUpdate(existing, holdingPatchSchema.parse({ price: 6 }), now)).toEqual({
      price: 6,
      value: 60,
      as_of: now.toISOString(),
    });
    expect(toHoldingUpdate(existing, holdingPatchSchema.parse({ quantity: 3 }), now).value).toBe(15);
  });

  it("prefers an explicit value and leaves value alone for unrelated edits", () => {
    expect(toHoldingUpdate(existing, holdingPatchSchema.parse({ price: 6, value: 1 }), now).value).toBe(1);
    expect(toHoldingUpdate(existing, holdingPatchSchema.parse({ name: "X" }), now)).not.toHaveProperty("value");
  });

  it("rejects an empty patch", () => {
    expect(holdingPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("canManageHoldings / holdingsBalanceGap", () => {
  it("only allows manual investment or retirement accounts", () => {
    expect(canManageHoldings({ isManual: true, assetClass: "retirement" })).toBe(true);
    expect(canManageHoldings({ isManual: true, assetClass: "investment" })).toBe(true);
    expect(canManageHoldings({ isManual: false, assetClass: "investment" })).toBe(false);
    expect(canManageHoldings({ isManual: true, assetClass: "cash" })).toBe(false);
  });

  it("reports the gap between holdings and balance", () => {
    expect(holdingsBalanceGap([], 100)).toBeNull();
    expect(holdingsBalanceGap([{ value: 60 }, { value: 40 }], 100)).toBeNull();
    expect(holdingsBalanceGap([{ value: 60 }, { value: 50 }], 100)).toEqual({ total: 110, gap: 10 });
  });
});
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
