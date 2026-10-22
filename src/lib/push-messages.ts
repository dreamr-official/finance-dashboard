import { fmtCurrency } from "./format";
import type { TransactionType } from "./types";

export interface DividendNoticeRow {
  name: string;
  accountName: string;
  amount: number;
  type: Extract<TransactionType, "dividend" | "interest">;
}

export function buildDividendNotification(rows: DividendNoticeRow[]) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (rows.length === 1) {
    const row = rows[0];
    const symbol = row.name.match(/(?:dividend|interest)[\s:–-]+([A-Z][A-Z0-9.-]{0,9})\b/i)?.[1];
    const label = row.type === "dividend" ? "Dividend" : "Interest";
    return {
      title: `${label} received`,
      body: `${label}: ${fmtCurrency(row.amount)} into ${row.accountName}${symbol ? ` (${symbol})` : ""}`,
      url: "/investments",
    };
  }
  return {
    title: "New dividends & interest",
    body: `${rows.length} new dividend/interest payments · ${fmtCurrency(total)} total`,
    url: "/investments",
  };
}
