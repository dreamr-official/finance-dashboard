"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fmtCompact, fmtCurrency, fmtDate } from "@/lib/format";
import {
  chartSpanDays,
  chartTicks,
  chartTimeDomain,
  formatChartTime,
  paddedAmountDomain,
  withChartTime,
} from "@/lib/chart-data";

export function BalanceChart({
  data,
  label = "Balance",
}: {
  data: { date: string; balance: number }[];
  label?: string;
}) {
  const chartData = withChartTime(data);
  const spanDays = chartSpanDays(chartData);
  const ticks = chartTicks(chartData);
  const dateByTime = new Map(chartData.map((point) => [point.t, point.date]));
  const domain = paddedAmountDomain(chartData.map((point) => point.balance));
  return (
    <div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => fmtCompact(v)}
            width={56}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            domain={domain}
          />
          <Tooltip
            formatter={(v) => [fmtCurrency(Number(v)), label]}
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
          <Area
            type="linear"
            dataKey="balance"
            stroke="var(--color-chart-1, #10b981)"
            strokeWidth={2}
            fill="url(#bal)"
            isAnimationActive={false}
            dot={chartData.length === 1}
          />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Balance at the end of each day
      </p>
    </div>
  );
}
