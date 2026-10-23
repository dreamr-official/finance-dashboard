"use client";

import { useState } from "react";
import Link from "next/link";
import type { AccountChange } from "@/lib/finance";
import { fmtCurrency, fmtShare } from "@/lib/format";
import { Delta } from "@/components/delta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Period = "day" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "1D" },
  { key: "week", label: "1W" },
  { key: "month", label: "1M" },
];

export function AccountChanges({
  changes,
  institutionNames,
}: {
  changes: Record<Period, AccountChange[]>;
  institutionNames: Record<string, string>;
}) {
  const [period, setPeriod] = useState<Period>("day");
  const selected = changes[period];
  const unchanged = selected.filter((entry) => !entry.isNew && entry.change === 0).length;
  const visible = selected.filter((entry) => entry.isNew || entry.change !== 0);
  const netChange = selected.reduce((total, entry) => total + (entry.change ?? 0), 0);
  const hasHistory = selected.some((entry) => !entry.isNew);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>What changed</CardTitle>
        <div className="flex gap-1">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              className={`min-h-9 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {visible.length ? (
          <ul className="divide-y">
            {visible.map((entry) => (
              <li
                key={entry.account.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <Link
                  href={`/accounts/${entry.account.id}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-sm font-medium hover:underline">
                    {entry.account.name}
                  </span>
                  {institutionNames[entry.account.institutionId] && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {institutionNames[entry.account.institutionId]}
                    </span>
                  )}
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  {entry.isNew ? (
                    <Badge variant="secondary">New</Badge>
                  ) : (
                    <div className="text-right">
                      <Delta value={entry.change} />
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {entry.pct === null ? "—" : fmtShare(entry.pct * 100)}
                      </div>
                    </div>
                  )}
                  <span className="w-24 text-right text-sm tabular-nums">
                    {fmtCurrency(entry.end, { decimals: 0 })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            {hasHistory
              ? "No account balances changed in this period."
              : "Not enough history yet — changes appear after the first daily snapshot."}
          </p>
        )}
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Net change</span>
          <Delta value={netChange} />
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {unchanged} unchanged
        </p>
      </CardContent>
    </Card>
  );
}
