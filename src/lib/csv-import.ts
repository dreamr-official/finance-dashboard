import Papa from "papaparse";
import { createHash } from "crypto";
import { classifyType } from "./transactions";

const VALID_TYPES = new Set([
  "deposit",
  "withdrawal",
  "transfer_in",
  "transfer_out",
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "expense",
  "income",
  "other",
]);

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  const parenthesized = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\$/, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

export function parseCsv(csv: string) {
  const parsed = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: "greedy",
  });
  const rows: {
    provider_txn_id: string;
    date: string;
    name: string;
    amount: number;
    type: string;
  }[] = [];
  const occurrences = new Map<string, number>();
  let skipped = parsed.errors.length;

  for (const fields of parsed.data) {
    const cells = fields.map((field) => String(field ?? "").trim());
    if (!cells.length || cells[0].toLowerCase() === "date") continue;
    const line = cells.join(",");
    const occurrenceIndex = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrenceIndex + 1);

    const date = cells[0];
    const name = cells[1] ?? "";
    let typeRaw: string | undefined;
    let amountParts: string[];
    if (cells.length === 3) {
      amountParts = cells.slice(2);
    } else if (cells.length === 4 && parseAmount(cells[3]) !== null) {
      amountParts = cells.slice(2);
    } else if (cells.length >= 4) {
      amountParts = cells.slice(2, -1);
      typeRaw = cells[cells.length - 1];
    } else {
      skipped += 1;
      continue;
    }
    const amount = parseAmount(amountParts.join(""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || amount === null) {
      skipped += 1;
      continue;
    }
    const suppliedType = typeRaw?.toLowerCase();
    const type = suppliedType && VALID_TYPES.has(suppliedType)
      ? suppliedType
      : classifyType(name, amount);
    rows.push({
      provider_txn_id: `csv-${createHash("sha256")
        .update(`${line}#${occurrenceIndex}`)
        .digest("hex")}`,
      date,
      name: name.slice(0, 200),
      amount,
      type,
    });
  }
  return { rows, skipped };
}
