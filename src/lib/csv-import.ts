import Papa from "papaparse";
import { createHash } from "crypto";
import { classifyType, normalizeTransactionAmount } from "./transactions";
import { isoDate } from "./validation";

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

  const headerRowIndex = parsed.data.findIndex(
    (fields) => String(fields[0] ?? "").replace(/^\uFEFF/, "").trim().toLowerCase() === "date",
  );
  const headers = headerRowIndex >= 0
    ? parsed.data[headerRowIndex].map((field) => String(field ?? "").trim().toLowerCase())
    : null;
  const balanceIndex = headers?.findIndex((header) =>
    ["balance", "running balance"].includes(header),
  ) ?? -1;
  const typeIndex = headers?.indexOf("type") ?? -1;

  for (const [rowIndex, fields] of parsed.data.entries()) {
    const cells = fields.map((field) => String(field ?? "").trim());
    if (!cells.length || rowIndex === headerRowIndex) continue;
    const line = cells.join(",");
    const occurrenceIndex = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrenceIndex + 1);

    const date = cells[0];
    const name = cells[1] ?? "";
    const hasSplitThousands =
      cells.length >= 4 &&
      (!headers || balanceIndex < 0 || cells.length > headers.length) &&
      !cells[2]?.includes(".") &&
      /^\d{3}(?:\.\d+)?$/.test(cells[3]);
    const amountRaw = hasSplitThousands
      ? `${cells[2]}${cells[3]}`
      : (cells[2] ?? "");
    const lastCell = cells[cells.length - 1]?.toLowerCase();
    const typeRaw =
      typeIndex >= 0
        ? cells[typeIndex + (hasSplitThousands && typeIndex > 2 ? 1 : 0)]
        : lastCell && VALID_TYPES.has(lastCell)
          ? lastCell
          : undefined;
    if (!amountRaw) {
      skipped += 1;
      skippedReasons.push("missing amount");
      continue;
    }
    const amount = parseAmount(amountRaw);
    if (!isoDate.safeParse(date).success) {
      skipped += 1;
      skippedReasons.push("invalid date");
      continue;
    }
    if (!name) {
      skipped += 1;
      skippedReasons.push("missing name");
      continue;
    }
    if (amount === null) {
      skipped += 1;
      skippedReasons.push("invalid amount");
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
      amount: normalizeTransactionAmount(amount, type),
      type,
    });
  }
  return { rows, skipped, skippedReasons };
}
