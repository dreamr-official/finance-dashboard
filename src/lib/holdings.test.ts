import { describe, expect, it } from "vitest";
import {
  canManageHoldings,
  holdingCreateSchema,
  holdingPatchSchema,
  holdingsBalanceGap,
  toHoldingInsert,
  toHoldingUpdate,
} from "./holdings";

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
