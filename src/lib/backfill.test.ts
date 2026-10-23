import { describe, expect, it } from "vitest";
import { rebuildAccountHistory, reconstructBalances } from "./backfill";
import { shiftDate } from "./dates";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const builder = (table: string) => {
    const filters: { column: string; operator: "eq" | "lt"; value: unknown }[] = [];
    let operation = "select";
    let rows: Row[] = [];
    let range: [number, number] | undefined;
    let single = false;
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, operator: "eq", value });
        return query;
      },
      lt(column: string, value: unknown) {
        filters.push({ column, operator: "lt", value });
        return query;
      },
      order() {
        return query;
      },
      range(from: number, to: number) {
        range = [from, to];
        return query;
      },
      maybeSingle() {
        single = true;
        return query;
      },
      single() {
        single = true;
        return query;
      },
      insert(row: Row) {
        operation = "insert";
        rows = [row];
        return query;
      },
      delete() {
        operation = "delete";
        return query;
      },
      upsert(value: Row | Row[]) {
        operation = "upsert";
        rows = Array.isArray(value) ? value : [value];
        return query;
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        const tableRows = (tables[table] ??= []);
        const matches = (row: Row) =>
          filters.every(({ column, operator, value }) =>
            operator === "eq"
              ? row[column] === value
              : String(row[column]) < String(value),
          );
        if (operation === "insert") {
          const inserted = { id: `txn-${tableRows.length + 1}`, ...rows[0] };
          tableRows.push(inserted);
          return resolve({ data: single ? inserted : [inserted], error: null });
        }
        if (operation === "delete") {
          tables[table] = tableRows.filter((row) => !matches(row));
          return resolve({ data: null, error: null });
        }
        if (operation === "upsert") {
          for (const row of rows) {
            const existing = tableRows.find(
              (candidate) =>
                candidate.account_id === row.account_id &&
                candidate.date === row.date,
            );
            if (existing) Object.assign(existing, row);
            else tableRows.push({ ...row });
          }
          return resolve({ data: null, error: null });
        }
        let data = tableRows.filter(matches);
        if (range) data = data.slice(range[0], range[1] + 1);
        return resolve({ data: single ? data[0] ?? null : data, error: null });
      },
    };
    return query;
  };
  return { from: (table: string) => builder(table) } as never;
}

describe("balance history reconstruction", () => {
  it("emits the end-of-day balance before the earliest transaction", () => {
    const rows = reconstructBalances(
      1500,
      [{ date: "2026-10-13", amount: 500, pending: false }],
      "2026-10-23",
    );

    expect(rows[0]).toEqual({ date: "2026-10-12", balance: 1000 });
    expect(rows.at(-1)).toEqual({ date: "2026-10-22", balance: 1500 });
  });

  it("moves earlier points after a backdated transaction", () => {
    const rows = reconstructBalances(
      600,
      [
        { date: "2026-10-18", amount: -400, pending: false },
        { date: "2026-10-19", amount: 9000, pending: true },
      ],
      "2026-10-23",
    );

    expect(rows.find((row) => row.date === "2026-10-17")?.balance).toBe(1000);
    expect(rows.find((row) => row.date === "2026-10-18")?.balance).toBe(600);
    expect(rows.find((row) => row.date === "2026-10-19")?.balance).toBe(600);
  });

  it("overwrites observed manual-account rows while preserving manual, legacy, and Plaid anchors", async () => {
    const today = "2026-10-23";
    const manualId = "manual";
    const plaidId = "plaid";
    const manualAnchorDate = shiftDate(today, -4);
    const legacyAnchorDate = shiftDate(today, -3);
    const observedDate = shiftDate(today, -2);
    const plaidObservedDate = shiftDate(today, -3);
    const tables: Record<string, Row[]> = {
      accounts: [
        {
          id: manualId,
          asset_class: "cash",
          current_balance: 800,
          is_manual: true,
        },
        {
          id: plaidId,
          asset_class: "cash",
          current_balance: 700,
          is_manual: false,
        },
      ],
      transactions: [
        {
          id: "manual-txn",
          account_id: manualId,
          date: shiftDate(today, -5),
          amount: -200,
          pending: false,
        },
        {
          id: "plaid-txn",
          account_id: plaidId,
          date: shiftDate(today, -5),
          amount: 100,
          pending: false,
        },
      ],
      balance_snapshots: [
        {
          account_id: manualId,
          date: today,
          balance: 800,
          source: "manual",
        },
        {
          account_id: manualId,
          date: manualAnchorDate,
          balance: 888,
          source: "manual",
        },
        {
          account_id: manualId,
          date: legacyAnchorDate,
          balance: 999,
          source: "recorded",
        },
        {
          account_id: manualId,
          date: observedDate,
          balance: 1234,
          source: "observed",
        },
        {
          account_id: plaidId,
          date: today,
          balance: 700,
          source: "observed",
        },
        {
          account_id: plaidId,
          date: plaidObservedDate,
          balance: 650,
          source: "observed",
        },
      ],
    };
    const supabase = fakeSupabase(tables);

    await rebuildAccountHistory(supabase, manualId, today);
    await rebuildAccountHistory(supabase, plaidId, today);

    const snapshot = (accountId: string, date: string) =>
      tables.balance_snapshots.find(
        (row) => row.account_id === accountId && row.date === date,
      );
    expect(snapshot(manualId, today)).toMatchObject({
      balance: 800,
      source: "manual",
    });
    expect(snapshot(manualId, manualAnchorDate)).toMatchObject({
      balance: 888,
      source: "manual",
    });
    expect(snapshot(manualId, legacyAnchorDate)).toMatchObject({
      balance: 999,
      source: "recorded",
    });
    expect(snapshot(manualId, observedDate)).toMatchObject({
      balance: 800,
      source: "reconstructed",
    });
    expect(snapshot(plaidId, plaidObservedDate)).toMatchObject({
      balance: 650,
      source: "observed",
    });
  });

  it("never includes today's balance in reconstructed rows", () => {
    expect(
      reconstructBalances(
        800,
        [{ date: "2026-10-18", amount: -200, pending: false }],
        "2026-10-23",
      ).some((row) => row.date === "2026-10-23"),
    ).toBe(false);
  });
});
