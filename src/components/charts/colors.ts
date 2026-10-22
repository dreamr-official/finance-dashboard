export const CHART_COLORS = [
  { fill: "var(--chart-5)", text: "#fff" },
  { fill: "var(--chart-2)", text: "#fff" },
  { fill: "var(--chart-4)", text: "#fff" },
  { fill: "var(--chart-1)", text: "oklch(0.205 0 0)" },
  { fill: "var(--chart-3)", text: "#fff" },
  { fill: "oklch(0.7 0 0)", text: "oklch(0.205 0 0)" },
] as const;

export const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];
