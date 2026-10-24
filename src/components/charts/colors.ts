export const CHART_COLORS = [
  { fill: "var(--chart-1)", text: "oklch(0.2 0 0)" },
  { fill: "var(--chart-2)", text: "oklch(0.2 0 0)" },
  { fill: "var(--chart-3)", text: "oklch(0.3 0.05 80)" },
  { fill: "var(--chart-4)", text: "oklch(0.2 0 0)" },
  { fill: "var(--chart-5)", text: "oklch(0.2 0 0)" },
  { fill: "oklch(0.85 0.04 172)", text: "oklch(0.3 0.06 172)" },
] as const;

export const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];
