"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtCurrency, fmtDate } from "@/lib/format";
import {
  chartSpanDays,
  chartTicks,
  chartTimeDomain,
  formatChartTime,
  withChartTime,
} from "@/lib/chart-data";

export function ContributionsChart({
  data,
}: {
  data: { date: string; value: number }[];
}) {
  const chartData = withChartTime(data);
  const spanDays = chartSpanDays(chartData);
  const ticks = chartTicks(chartData);
  const dateByTime = new Map(chartData.map((point) => [point.t, point.date]));
  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={chartTimeDomain(chartData)}
            ticks={ticks}
            tickFormatter={(value) => formatChartTime(Number(value), spanDays)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => fmtCompact(value)}
            width={64}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [fmtCurrency(Number(value)), "Net contributions"]}
            labelFormatter={(value) =>
              fmtDate(
                dateByTime.get(Number(value)) ??
                  new Date(Number(value)).toISOString().slice(0, 10),
              )
            }
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontSize: 12,
            }}
          />
          <Line
            type="stepAfter"
            dataKey="value"
            stroke="var(--color-chart-1, #10b981)"
            strokeWidth={2}
            dot={chartData.length === 1}
            activeDot
            isAnimationActive={false}
          />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Total put in over time (running total)
      </p>
    </div>
  );
}
