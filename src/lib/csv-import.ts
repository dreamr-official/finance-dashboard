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
  let normalized = value.trim();
  if (!normalized) return null;
  const parenthesized = normalized.startsWith("(") && normalized.endsWith(")");
  if (parenthesized) normalized = normalized.slice(1, -1).trim();
  let negative = parenthesized;
  if (normalized.startsWith("-")) {
    negative = true;
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("$")) normalized = normalized.slice(1);
  if (normalized.startsWith("-")) {
    negative = true;
    normalized = normalized.slice(1);
  }
  if (!/^(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
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
  const skippedReasons: string[] = [];

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
    const amountRaw = amountParts.join("").trim();
    if (!amountRaw) {
      skipped += 1;
      skippedReasons.push("missing amount");
      continue;
    }
    const amount = parseAmount(amountRaw);
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
  return { rows, skipped, skippedReasons };
}
