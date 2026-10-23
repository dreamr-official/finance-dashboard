import { describe, expect, it } from "vitest";
import {
  chunk,
  compareNewestFirst,
  filterTransactions,
  groupByMonth,
  PAGE_STEP,
  parseLimit,
  parseTransactionFilters,
  withParams,
} from "./transaction-list";
import type { Transaction } from "./types";

function transaction(
  id: string,
  date: string,
  options: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    accountId: "checking",
    date,
    name: "Transaction",
    amount: 0,
    type: "other",
    ...options,
  };
}

describe("transaction list pagination", () => {
  it("parses limits, rounds up to the next page, and caps at 100000", () => {
    expect(PAGE_STEP).toBe(100);
    expect(parseLimit(undefined)).toBe(100);
    expect(parseLimit(["200"])).toBe(100);
    expect(parseLimit("")).toBe(100);
    expect(parseLimit("not-a-number")).toBe(100);
    expect(parseLimit("0")).toBe(100);
    expect(parseLimit("-5")).toBe(100);
    expect(parseLimit("1")).toBe(100);
    expect(parseLimit("100")).toBe(100);
    expect(parseLimit("101")).toBe(200);
    expect(parseLimit("200")).toBe(200);
    expect(parseLimit("100001")).toBe(100000);
    expect(parseLimit("999999999999999999999999")).toBe(100000);
  });

  it("ignores invalid filter values and keeps the display query's case", () => {
    expect(
      parseTransactionFilters({
        account: ["checking"],
        type: "expense",
        month: "2026-13",
        from: "2026-02-30",
        to: "2026/03/01",
        q: "  Whole Foods  ",
      }),
    ).toEqual({
      accountId: "",
      type: "expense",
      month: "",
      from: "",
      to: "",
      q: "Whole Foods",
    });
  });

  it("filters by account, type, month, inclusive date bounds, and case-insensitive text", () => {
    const transactions = [
      transaction("1", "2026-03-01", {
        accountId: "checking",
        type: "expense",
        name: "Whole Foods",
        category: "Groceries",
      }),
      transaction("2", "2026-03-31", {
        accountId: "checking",
        type: "expense",
        name: "Corner Shop",
        category: "Groceries",
      }),
      transaction("3", "2026-03-15", {
        accountId: "savings",
        type: "income",
        name: "Payroll",
      }),
      transaction("4", "2026-04-01", {
        accountId: "checking",
        type: "expense",
        name: "Whole Foods",
      }),
    ];
    const filters = parseTransactionFilters({
      account: "checking",
      type: "expense",
      month: "2026-03",
      from: "2026-03-01",
      to: "2026-03-31",
      q: "  gRoCeRiEs ",
    });

    expect(filterTransactions(transactions, filters).map(({ id }) => id)).toEqual(["2", "1"]);
    expect(
      filterTransactions(transactions, {
        ...filters,
        accountId: "",
        type: "",
        month: "",
        from: "",
        to: "",
        q: "wHoLe FoOd",
      }).map(({ id }) => id),
    ).toEqual(["4", "1"]);
  });

  it("sorts newest first and resolves same-date ties by descending id", () => {
    const rows = [
      transaction("b", "2026-01-01"),
      transaction("a", "2026-01-02"),
      transaction("c", "2026-01-02"),
    ];
    expect(rows.sort(compareNewestFirst).map(({ id }) => id)).toEqual(["c", "a", "b"]);
  });

  it("groups visible rows in order while calculating month totals from all rows", () => {
    const visible = [
      transaction("4", "2026-02-03", { amount: -8, type: "expense" }),
      transaction("3", "2026-01-20", { amount: 20, type: "deposit" }),
    ];
    const all = [
      ...visible,
      transaction("2", "2026-02-01", { amount: 50, type: "transfer_in" }),
      transaction("1", "2026-02-02", { amount: -12, type: "transfer_out" }),
      transaction("5", "2026-02-04", { amount: 30, type: "income" }),
    ];
    expect(groupByMonth(visible, all)).toEqual([
      {
        month: "2026-02",
        label: "February 2026",
        moneyIn: 30,
        moneyOut: 8,
        count: 4,
        transactions: [visible[0]],
      },
      {
        month: "2026-01",
        label: "January 2026",
        moneyIn: 20,
        moneyOut: 0,
        count: 1,
        transactions: [visible[1]],
      },
    ]);
    expect(groupByMonth([transaction("jan", "2026-01-31")], []).map((g) => g.label)).toEqual([
      "January 2026",
    ]);
  });

  it("builds parameterized links and chunks arrays", () => {
    expect(
      withParams(
        "/activity",
        { account: "a-1", q: "whole foods", type: "" },
        { limit: "200", q: null },
      ),
    ).toBe("/activity?account=a-1&limit=200");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});
