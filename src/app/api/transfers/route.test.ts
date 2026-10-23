import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate } from "../../../lib/validation";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/backfill");
  vi.doUnmock("@/lib/transfers");
  vi.doUnmock("@/lib/dates");
  vi.doUnmock("@/lib/validation");
  vi.doUnmock("@/lib/api-error");
});

describe("transfer date validation", () => {
  it("rejects dates more than seven days ahead", async () => {
    vi.doMock("@/lib/auth", () => ({
      requireAdmin: async () => undefined,
      authErrorResponse: () => Response.json({}, { status: 401 }),
    }));
    vi.doMock("@/lib/env", () => ({ isDemoMode: () => false }));
    vi.doMock("@/lib/backfill", () => ({ rebuildAccountHistory: vi.fn() }));
    vi.doMock("@/lib/transfers", () => ({ buildTransferLegs: vi.fn() }));
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

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://dashboard.test/api/transfers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from_account_id: "11111111-1111-4111-8111-111111111111",
          to_account_id: "22222222-2222-4222-8222-222222222222",
          amount: 100,
          date: "2026-10-31",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Transfer date cannot be more than 7 days in the future.",
    });
  });
});
