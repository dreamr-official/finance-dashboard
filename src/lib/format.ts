export function fmtCurrency(n: number, opts: { sign?: boolean; decimals?: number } = {}) {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(abs);
  if (opts.sign) return (n < 0 ? "-" : "+") + s;
  return n < 0 ? `-${s}` : s;
}

export function fmtCompact(n: number) {
  if (Math.abs(n) < 0.5) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);
}

export function fmtPct(n: number | null, decimals = 1) {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function fmtShare(n: number, decimals = 1) {
  return `${n.toFixed(decimals)}%`;
}

export function fmtDate(d: string | Date) {
  const dateOnly = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

export function fmtChartTick(date: string, spanDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const month = value.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (spanDays <= 200) {
    return value.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return `${month} '${value.toLocaleDateString("en-US", { year: "2-digit", timeZone: "UTC" })}`;
}
