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

export function BalanceChart({
  data,
}: {
  data: { date: string; balance: number }[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-chart-1, #10b981)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
            }
            tick={{ fontSize: 11 }}
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtCompact(v)}
            width={56}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) => [fmtCurrency(Number(v)), "Balance"]}
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
            dataKey="balance"
            stroke="var(--color-chart-1, #10b981)"
            strokeWidth={2}
            fill="url(#bal)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
