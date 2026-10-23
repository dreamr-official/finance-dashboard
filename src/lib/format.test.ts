import { describe, expect, it } from "vitest";
import { fmtChartTick, fmtDate } from "./format";

describe("date-only formatting", () => {
  it("formats date-only strings in UTC", () => {
    expect(fmtDate("2026-10-22")).toBe("Oct 22, 2026");
  });

  it("chooses concise chart ticks based on the date span", () => {
    expect(fmtChartTick("2026-10-22", 200)).toBe("Oct 22");
    expect(fmtChartTick("2026-10-22", 201)).toBe("Oct '26");
  });
});
