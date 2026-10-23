"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fmtChartTick, fmtCompact, fmtCurrency, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 91 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "All", days: Infinity },
] as const;

export function NetWorthChart({
  data,
}: {
  data: { date: string; value: number }[];
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1Y");
  const filtered = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    if (r.days === Infinity) return data;
    const lastDate = data[data.length - 1]?.date;
    if (!lastDate) return data;
    const cutoff = new Date(`${lastDate}T00:00:00.000Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - r.days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return data.filter((point) => point.date >= cutoffDate);
  }, [data, range]);
  const firstDate = filtered[0]?.date;
  const lastDate = filtered[filtered.length - 1]?.date;
  const spanDays =
    firstDate && lastDate
      ? (Date.parse(`${lastDate}T00:00:00.000Z`) -
          Date.parse(`${firstDate}T00:00:00.000Z`)) /
        86400000
      : 0;

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              range === r.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {r.key}
          </button>
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <AreaChart data={filtered} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => fmtChartTick(String(value), spanDays)}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              minTickGap={48}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtCompact(v)}
              width={64}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
              domain={["dataMin", "dataMax"]}
            />
            <Tooltip
              formatter={(v) => [fmtCurrency(Number(v)), "Net worth"]}
              labelFormatter={(v) => fmtDate(String(v))}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-1, #10b981)"
              strokeWidth={2}
              fill="url(#nw)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
