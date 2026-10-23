import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate } from "../../../lib/validation";

type Row = Record<string, unknown>;

function fakeSupabase(snapshotFailure = false) {
  const accounts: Row[] = [];
  const calls: string[] = [];

  const client = {
    from(table: string) {
      let operation = "select";
      let write: Row = {};
      const filters: [string, unknown][] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        maybeSingle() {
          return query;
        },
        single() {
          return query;
        },
        insert(row: Row) {
          operation = "insert";
          write = row;
          return query;
        },
        upsert(row: Row) {
          operation = "upsert";
          write = row;
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        then(resolve: (result: { data: unknown; error: Row | null }) => void) {
          if (table === "institutions" && operation === "select") {
            return resolve({ data: null, error: null });
          }
          if (table === "institutions" && operation === "insert") {
            return resolve({ data: { id: "institution-id" }, error: null });
          }
          if (table === "accounts" && operation === "insert") {
            const account = { id: "account-id", ...write };
            accounts.push(account);
            return resolve({ data: account, error: null });
          }
          if (table === "balance_snapshots" && operation === "upsert") {
            return resolve({
              data: null,
              error: snapshotFailure ? { message: "snapshot insert failed" } : null,
            });
          }
          if (table === "accounts" && operation === "delete") {
            const id = filters.find(([column]) => column === "id")?.[1];
            calls.push(`delete:${String(id)}`);
            accounts.splice(
              0,
              accounts.length,
              ...accounts.filter((account) => account.id !== id),
            );
            return resolve({ data: null, error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return query;
    },
  };

  return { client, accounts, calls };
}

function mockRoute(fake: ReturnType<typeof fakeSupabase>) {
  vi.doMock("@/lib/auth", () => ({
    requireAdmin: async () => undefined,
    authErrorResponse: () => Response.json({}, { status: 401 }),
  }));
  vi.doMock("@/lib/env", () => ({ isDemoMode: () => false }));
  vi.doMock("@/lib/account-types", () => ({
    ASSET_CLASS: {
      checking: "cash",
      savings: "cash",
      brokerage: "investment",
      roth_ira: "retirement",
      traditional_ira: "retirement",
      "401k": "retirement",
      credit_card: "liability",
      loan: "liability",
      cash: "cash",
      other: "other",
    },
  }));
  vi.doMock("@/lib/dates", () => ({ appToday: () => "2026-10-23" }));
  vi.doMock("@/lib/validation", () => ({ isoDate }));
  vi.doMock("@/lib/api-error", () => ({
    apiErrorResponse: (error: { message?: string }) =>
      Response.json({ error: error.message }, { status: 500 }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => fake.client,
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/account-types");
  vi.doUnmock("@/lib/dates");
  vi.doUnmock("@/lib/validation");
  vi.doUnmock("@/lib/api-error");
  vi.doUnmock("@/lib/supabase/server");
});

describe("manual account creation", () => {
  it("rejects an impossible opening date before inserting an account", async () => {
    const fake = fakeSupabase();
    mockRoute(fake);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://dashboard.test/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Test account",
          institution_name: "Test bank",
          type: "checking",
          opening_balance: 100,
          opening_date: "2026-02-30",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fake.accounts).toHaveLength(0);
  });

  it("deletes the created account if the opening snapshot insert fails", async () => {
    const fake = fakeSupabase(true);
    mockRoute(fake);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://dashboard.test/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Test account",
          institution_name: "Test bank",
          type: "checking",
          opening_balance: 100,
          opening_date: "2026-10-23",
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(fake.accounts).toHaveLength(0);
    expect(fake.calls).toContain("delete:account-id");
  });
});
