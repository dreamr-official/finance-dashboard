"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { fmtCurrency, fmtShare } from "@/lib/format";
import type { Slice } from "@/lib/holdings";
import { chartColor } from "./colors";

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  showLegend = true,
  size = 200,
}: {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
  size?: number;
}) {
  if (data.length === 0) return null;

  const renderLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    index,
    payload,
  }: PieLabelRenderProps) => {
    if (Number(payload?.pct) < 7 || midAngle === undefined) return null;
    const radius = innerRadius + (outerRadius - innerRadius) / 2;
    const angle = (-midAngle * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return (
      <text
        x={x}
        y={y}
        fill={chartColor(index).text}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
      >
        {fmtShare(Number(payload.pct), 0)}
      </text>
    );
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className="relative mx-auto max-w-full shrink-0"
        style={{ width: size, height: size }}
      >
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={1}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
            label={renderLabel}
            labelLine={false}
          >
            {data.map((slice, index) => (
              <Cell key={slice.key} fill={chartColor(index).fill} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ zIndex: 20 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const slice = payload[0].payload as Slice | undefined;
              if (!slice) return null;
              const value = Number(payload[0].value ?? slice.value);
              const sources = slice.sources ?? [];
              return (
                <div className="max-w-[240px] rounded-lg border bg-card px-3 py-2 text-xs shadow-sm">
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{slice.label}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      {fmtCurrency(value)} · {fmtShare(slice.pct)}
                    </span>
                  </div>
                  {sources.length > 0 && (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      {sources.slice(0, 6).map((source, sourceIndex) => (
                        <div
                          key={`${source.label}-${sourceIndex}`}
                          className="flex min-w-0 items-center justify-between gap-2 text-muted-foreground"
                        >
                          <span className="min-w-0 truncate">{source.label}</span>
                          <span className="shrink-0 tabular-nums">
                            {fmtCurrency(source.value, { decimals: 0 })}
                          </span>
                        </div>
                      ))}
                      {sources.length > 6 && (
                        <div className="text-muted-foreground">+{sources.length - 6} more</div>
                      )}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </PieChart>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="max-w-[62%] truncate text-base font-semibold tabular-nums">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-xs text-muted-foreground">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      {showLegend && (
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-sm">
          {data.map((slice, index) => (
            <div key={slice.key} className="flex min-w-0 items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chartColor(index).fill }}
              />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                {fmtShare(slice.pct)} · {fmtCurrency(slice.value, { decimals: 0 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
