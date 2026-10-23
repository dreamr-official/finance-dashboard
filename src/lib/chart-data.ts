import { fmtChartTick } from "./format";

const DAY_MS = 86_400_000;

export type TimedPoint<T extends { date: string }> = T & { t: number };

export function withChartTime<T extends { date: string }>(
  data: T[],
): TimedPoint<T>[] {
  return data.map((point) => {
    const [year, month, day] = point.date.split("-").map(Number);
    return { ...point, t: Date.UTC(year, month - 1, day) };
  });
}

export function chartTicks<T extends { t: number }>(
  data: T[],
  count = 6,
): number[] {
  const times = [...new Set(data.map((point) => point.t))].sort((a, b) => a - b);
  if (times.length <= count) return times;
  return [
    ...new Set(
      Array.from({ length: count }, (_, index) =>
        times[Math.round((index * (times.length - 1)) / (count - 1))],
      ),
    ),
  ];
}

export function chartSpanDays<T extends { t: number }>(data: T[]): number {
  return data.length < 2
    ? 0
    : (data[data.length - 1].t - data[0].t) / DAY_MS;
}

export function chartTimeDomain<T extends { t: number }>(
  data: T[],
): [number | string, number | string] {
  if (data.length === 1) {
    return [data[0].t - DAY_MS, data[0].t + DAY_MS];
  }
  return ["dataMin", "dataMax"];
}

export function paddedAmountDomain(values: number[]): [number, number] | undefined {
  if (!values.length) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.05, 10);
  return [min - padding, max + padding];
}

export function formatChartTime(value: number, spanDays: number): string {
  return fmtChartTick(new Date(value).toISOString().slice(0, 10), spanDays);
}
