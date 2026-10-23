import { describe, expect, it } from "vitest";
import {
  chartTicks,
  chartTimeDomain,
  paddedAmountDomain,
  withChartTime,
} from "./chart-data";

describe("date-based chart data", () => {
  it("uses UTC midnight and evenly spaced unique ticks", () => {
    const points = withChartTime(
      Array.from({ length: 30 }, (_, index) => ({
        date: `2026-10-${String(index + 1).padStart(2, "0")}`,
        value: index,
      })),
    );
    const ticks = chartTicks(points);

    expect(points[0].t).toBe(Date.UTC(2026, 9, 1));
    expect(ticks).toHaveLength(6);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toBe(points[0].t);
    expect(ticks.at(-1)).toBe(points.at(-1)?.t);
  });

  it("pads the domain for one point and pads balance axes by at least ten", () => {
    const [point] = withChartTime([{ date: "2026-10-22", value: 100 }]);
    expect(chartTimeDomain([point])).toEqual([
      point.t - 86_400_000,
      point.t + 86_400_000,
    ]);
    expect(paddedAmountDomain([100])).toEqual([90, 110]);
    expect(paddedAmountDomain([100, 300])).toEqual([90, 310]);
  });
});
