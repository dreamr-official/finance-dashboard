import { describe, expect, it } from "vitest";
import { isoDate } from "./validation";

describe("isoDate", () => {
  it("accepts valid calendar dates", () => {
    expect(isoDate.safeParse("2024-02-29").success).toBe(true);
    expect(isoDate.safeParse("2026-10-23").success).toBe(true);
  });

  it("rejects impossible dates and unsupported formats", () => {
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("2026-13-01").success).toBe(false);
    expect(isoDate.safeParse("10/23/2026").success).toBe(false);
  });
});
