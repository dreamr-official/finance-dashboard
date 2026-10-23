import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="tabular-nums text-muted-foreground">—</span>;
  }
  const pos = value >= 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        value === 0 ? "text-muted-foreground" : pos ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {fmtCurrency(value, { sign: true })}
    </span>
  );
}
