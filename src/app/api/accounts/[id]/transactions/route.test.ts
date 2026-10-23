import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate } from "../../../../../lib/validation";

function fakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    accounts: [
      {
        id: "manual-account",
        current_balance: 1000,
        is_manual: true,
      },
    ],
    transactions: [],
    balance_snapshots: [],
  };
  const client = {
    from(table: string) {
      let operation = "select";
      let write: Record<string, unknown> = {};
      const filters: [string, unknown][] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        single() {
          return query;
        },
        insert(row: Record<string, unknown>) {
          operation = "insert";
          write = row;
          return query;
        },
        update(row: Record<string, unknown>) {
          operation = "update";
          write = row;
          return query;
        },
        upsert(row: Record<string, unknown>) {
          operation = "upsert";
          write = row;
          return query;
        },
        then(resolve: (result: { data: unknown; error: null }) => void) {
          const rows = tables[table];
          const found = rows.find((row) =>
            filters.every(([column, value]) => row[column] === value),
          );
          if (operation === "insert") {
            const inserted = { id: "new-transaction", ...write };
            rows.push(inserted);
            return resolve({ data: inserted, error: null });
          }
          if (operation === "update" && found) Object.assign(found, write);
          if (operation === "upsert") {
            const existing = rows.find(
              (row) =>
                row.account_id === write.account_id && row.date === write.date,
            );
            if (existing) Object.assign(existing, write);
            else rows.push(write);
          }
          return resolve({ data: found ?? null, error: null });
        },
      };
      return query;
    },
  };
  return { client, tables };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/backfill");
  vi.doUnmock("@/lib/transactions");
  vi.doUnmock("@/lib/dates");
  vi.doUnmock("@/lib/validation");
  vi.doUnmock("@/lib/api-error");
  vi.doUnmock("@/lib/supabase/server");
});

describe("manual transaction history", () => {
  it("rebuilds history after posting a backdated transaction", async () => {
    const fake = fakeSupabase();
    const rebuildAccountHistory = vi.fn();
    vi.doMock("@/lib/auth", () => ({
      requireAdmin: async () => undefined,
      authErrorResponse: () => Response.json({}, { status: 401 }),
    }));
    vi.doMock("@/lib/env", () => ({ isDemoMode: () => false }));
    vi.doMock("@/lib/backfill", () => ({ rebuildAccountHistory }));
    vi.doMock("@/lib/transactions", () => ({
      normalizeTransactionAmount: (amount: number) => amount,
    }));
    vi.doMock("@/lib/dates", () => ({
      appToday: () => "2026-10-23",
      shiftDate: (date: string, days: number) => {
        const shifted = new Date(`${date}T00:00:00.000Z`);
        shifted.setUTCDate(shifted.getUTCDate() + days);
        return shifted.toISOString().slice(0, 10);
      },
    }));
    vi.doMock("@/lib/validation", () => ({ isoDate }));
    vi.doMock("@/lib/api-error", () => ({
      apiErrorResponse: (error: { message?: string }) =>
        Response.json({ error: error.message }, { status: 500 }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => fake.client,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://dashboard.test/api/accounts/manual-account/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-09-01",
          name: "Backdated purchase",
          amount: -100,
          type: "expense",
        }),
      }),
      { params: Promise.resolve({ id: "manual-account" }) },
    );

    expect(response.status).toBe(201);
    expect(rebuildAccountHistory).toHaveBeenCalledWith(
      fake.client,
      "manual-account",
    );
    expect(fake.tables.balance_snapshots[0]).toMatchObject({
      source: "manual",
      balance: 900,
    });
  });

  it("rejects transaction dates more than seven days ahead", async () => {
    const fake = fakeSupabase();
    const rebuildAccountHistory = vi.fn();
    vi.doMock("@/lib/auth", () => ({
      requireAdmin: async () => undefined,
      authErrorResponse: () => Response.json({}, { status: 401 }),
    }));
    vi.doMock("@/lib/env", () => ({ isDemoMode: () => false }));
    vi.doMock("@/lib/backfill", () => ({ rebuildAccountHistory }));
    vi.doMock("@/lib/transactions", () => ({
      normalizeTransactionAmount: (amount: number) => amount,
    }));
    vi.doMock("@/lib/dates", () => ({
      appToday: () => "2026-10-23",
      shiftDate: (date: string, days: number) => {
        const shifted = new Date(`${date}T00:00:00.000Z`);
        shifted.setUTCDate(shifted.getUTCDate() + days);
        return shifted.toISOString().slice(0, 10);
      },
    }));
    vi.doMock("@/lib/validation", () => ({ isoDate }));
    vi.doMock("@/lib/api-error", () => ({
      apiErrorResponse: (error: { message?: string }) =>
        Response.json({ error: error.message }, { status: 500 }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => fake.client,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://dashboard.test/api/accounts/manual-account/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-10-31",
          name: "Future purchase",
          amount: -100,
          type: "expense",
        }),
      }),
      { params: Promise.resolve({ id: "manual-account" }) },
    );

    expect(response.status).toBe(400);
    expect(rebuildAccountHistory).not.toHaveBeenCalled();
    expect(fake.tables.transactions).toHaveLength(0);
  });
});
