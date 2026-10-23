import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-import";

describe("parseCsv", () => {
  it("detects headers and parses currency and parenthesized amounts", () => {
    const result = parseCsv(
      "date,name,amount,type\n2026-01-01,Investment,$1,234.56,deposit\n2026-01-02,Fee,(20.00),fee",
    );
    expect(result.rows.map((row) => [row.amount, row.type])).toEqual([
      [1234.56, "deposit"],
      [-20, "fee"],
    ]);
    expect(result.skipped).toBe(0);
  });

  it("keeps identical lines as stable, distinct rows and counts invalid lines", () => {
    const csv =
      "2026-01-01,Paycheck,100\n2026-01-01,Paycheck,100\ninvalid,row,nope";
    const first = parseCsv(csv);
    const second = parseCsv(csv);
    expect(first.rows).toHaveLength(2);
    expect(first.rows[0].provider_txn_id).not.toBe(first.rows[1].provider_txn_id);
    expect(first.rows.map((row) => row.provider_txn_id)).toEqual(
      second.rows.map((row) => row.provider_txn_id),
    );
    expect(first.skipped).toBe(1);
  });

  it("skips blank amounts with a reason and accepts a leading minus before currency", () => {
    const result = parseCsv(
      "2026-01-01,Missing amount,,expense\n2026-01-02,Refund,-$4.50,expense",
    );
    expect(result.skipped).toBe(1);
    expect(result.skippedReasons).toContain("missing amount");
    expect(result.rows.map((row) => row.amount)).toEqual([-4.5]);
  });

  it("accepts dollar-before-minus and parenthesized currency but not trailing minus", () => {
    const result = parseCsv(
      "2026-01-01,Refund,$-4.50\n2026-01-02,Refund,($4.50)\n2026-01-03,Refund,4.50-",
    );
    expect(result.rows.map((row) => row.amount)).toEqual([-4.5, -4.5]);
    expect(result.skipped).toBe(1);
  });
});
