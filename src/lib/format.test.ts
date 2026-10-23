import { describe, expect, it } from "vitest";
import { fmtChartTick, fmtCompact, fmtDate } from "./format";

describe("date-only formatting", () => {
  it("formats date-only strings in UTC", () => {
    expect(fmtDate("2026-10-22")).toBe("Oct 22, 2026");
  });

  it("chooses concise chart ticks based on the date span", () => {
    expect(fmtChartTick("2026-10-22", 200)).toBe("Oct 22");
    expect(fmtChartTick("2026-10-22", 201)).toBe("Oct '26");
  });
});

describe("compact currency formatting", () => {
  it("renders values that round to zero as $0", () => {
    expect(fmtCompact(0)).toBe("$0");
    expect(fmtCompact(-0)).toBe("$0");
    expect(fmtCompact(0.49)).toBe("$0");
    expect(fmtCompact(-0.49)).toBe("$0");
  });
});
