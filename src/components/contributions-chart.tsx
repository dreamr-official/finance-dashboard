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

export function ContributionsChart({
  data,
}: {
  data: { date: string; value: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
            }
            tick={{ fontSize: 11 }}
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => fmtCompact(value)}
            width={64}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [fmtCurrency(Number(value)), "Net contributions"]}
            labelFormatter={(value) => fmtDate(String(value))}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-chart-2, #6366f1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
