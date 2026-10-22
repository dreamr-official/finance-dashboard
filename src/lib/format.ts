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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtPct(n: number | null, decimals = 1) {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function fmtShare(n: number, decimals = 1) {
  return `${n.toFixed(decimals)}%`;
}

export function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
