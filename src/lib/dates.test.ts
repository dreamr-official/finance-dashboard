import { describe, expect, it } from "vitest";
import { appToday, shiftDate } from "./dates";

describe("app-local dates", () => {
  it("uses the configured app timezone for today", () => {
    expect(appToday(new Date("2026-10-24T02:00:00.000Z"))).toBe("2026-10-23");
  });

  it("shifts date-only values with UTC calendar arithmetic", () => {
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});
