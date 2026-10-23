import { describe, expect, it, vi } from "vitest";
import { fetchAll } from "./fetch-all";

describe("fetchAll", () => {
  it("reads pages until the provider returns a short page", async () => {
    const rows = Array.from({ length: 2005 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    expect(await fetchAll(fetchPage)).toEqual(rows);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws when a page has a provider error", async () => {
    await expect(
      fetchAll(async () => ({ data: null, error: { message: "query failed" } })),
    ).rejects.toThrow("Supabase query failed: query failed");
  });
});
