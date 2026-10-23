import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const queriedTables: string[] = [];
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let upsertRows: Row[] | null = null;
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      upsert(rows: Row | Row[]) {
        upsertRows = Array.isArray(rows) ? rows : [rows];
        return query;
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        queriedTables.push(table);
        if (upsertRows) {
          tables[table].push(...upsertRows);
          return resolve({ data: null, error: null });
        }
        const data = (tables[table] ?? []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return resolve({ data, error: null });
      },
    };
    return query;
  };
  return {
    client: { from: (table: string) => builder(table) } as never,
    queriedTables,
  };
}

const originalEnv = { ...process.env };

describe("daily snapshot cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.TOKEN_ENCRYPTION_KEY = "encryption-key";
    vi.doMock("@/lib/env", () => ({ isDemoMode: () => false }));
    vi.doMock("@/lib/integrations/registry", () => ({
      getProvider: () => ({ configured: true }),
    }));
    vi.doMock("@/lib/sync", () => ({ syncAllConnections: async () => [] }));
    vi.doMock("@/lib/dates", () => ({ appToday: () => "2026-10-23" }));
    vi.doMock("@/lib/subscriptions", () => ({
      getSubscriptionsToRemind: () => [],
    }));
    vi.doMock("@/lib/push", () => ({ sendPushToAll: vi.fn() }));
    vi.doMock("@/lib/format", () => ({ fmtCurrency: (value: number) => `$${value}` }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.doUnmock("@supabase/supabase-js");
    vi.doUnmock("@/lib/integrations/registry");
    vi.doUnmock("@/lib/sync");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/dates");
    vi.doUnmock("@/lib/subscriptions");
    vi.doUnmock("@/lib/push");
    vi.doUnmock("@/lib/format");
  });

  it("leaves failed-connection balances unsnapshotted and returns safe failure codes", async () => {
    const tables: Record<string, Row[]> = {
      accounts: [
        { id: "failed-account", connection_id: "failed-connection", current_balance: 50000 },
        { id: "healthy-account", connection_id: "healthy-connection", current_balance: 1200 },
        { id: "manual-account", connection_id: null, current_balance: 800 },
      ],
      balance_snapshots: [],
      subscriptions: [],
    };
    const fake = fakeSupabase(tables);
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => fake.client,
    }));
    vi.doMock("@/lib/sync", () => ({
      syncAllConnections: async () => [
        { connection: "failed-connection", error: "ITEM_LOGIN_REQUIRED" },
        { connection: "healthy-connection", synced: 2 },
      ],
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://dashboard.test/api/cron/daily-snapshot", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      date: "2026-10-23",
      snapshotted: 2,
      syncWarning: "failed-connection:ITEM_LOGIN_REQUIRED",
      failed: [{ connectionId: "failed-connection", errorCode: "ITEM_LOGIN_REQUIRED" }],
    });
    expect(JSON.stringify(body)).not.toContain("test-secret");
    expect(tables.balance_snapshots).toEqual([
      {
        account_id: "healthy-account",
        date: "2026-10-23",
        balance: 1200,
        source: "observed",
      },
      {
        account_id: "manual-account",
        date: "2026-10-23",
        balance: 800,
        source: "observed",
      },
    ]);
    expect(fake.queriedTables).toContain("subscriptions");
  });

  it("snapshots only manual accounts when connection sync throws", async () => {
    const tables: Record<string, Row[]> = {
      accounts: [
        { id: "linked-account", connection_id: "linked-connection", current_balance: 50000 },
        { id: "manual-account", connection_id: null, current_balance: 800 },
      ],
      balance_snapshots: [],
      subscriptions: [],
    };
    const fake = fakeSupabase(tables);
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => fake.client,
    }));
    vi.doMock("@/lib/sync", () => ({
      syncAllConnections: async () => {
        throw new Error("unexpected sync failure");
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://dashboard.test/api/cron/daily-snapshot", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      date: "2026-10-23",
      snapshotted: 1,
      syncWarning: "SYNC_FAILED",
      failed: [],
    });
    expect(tables.balance_snapshots).toEqual([
      {
        account_id: "manual-account",
        date: "2026-10-23",
        balance: 800,
        source: "observed",
      },
    ]);
  });

  it("rejects requests when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://dashboard.test/api/cron/daily-snapshot", {
        headers: { authorization: "Bearer undefined" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
