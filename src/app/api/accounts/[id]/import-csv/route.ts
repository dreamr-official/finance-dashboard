import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";
import { createHash } from "crypto";

const schema = z.object({
  csv: z.string().min(1).max(2_000_000),
});

const VALID_TYPES = new Set([
  "deposit","withdrawal","transfer_in","transfer_out","buy","sell",
  "dividend","interest","fee","expense","income","other",
]);

/** Parses CSV lines: date,name,amount[,type]
 *  - date: YYYY-MM-DD
 *  - amount: signed number (+ in, − out)
 *  - type (optional): one of txn_type; heuristics applied when absent
 *  Idempotent: provider_txn_id = sha256(row) → safe to re-import. */
function parseCsv(csv: string) {
  const rows: {
    provider_txn_id: string;
    date: string;
    name: string;
    amount: number;
    type: string;
  }[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^date\s*,/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [date, name, amountStr, typeRaw] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount)) continue;
    let type = typeRaw?.toLowerCase();
    if (!type || !VALID_TYPES.has(type)) {
      type = amount >= 0 ? "income" : "expense";
      if (/transfer|xfer|zelle/i.test(name)) {
        type = amount >= 0 ? "transfer_in" : "transfer_out";
      }
      if (/dividend/i.test(name)) type = "dividend";
      if (/interest/i.test(name)) type = "interest";
      if (/deposit|contrib/i.test(name)) type = "deposit";
      if (/withdraw/i.test(name)) type = "withdrawal";
    }
    rows.push({
      provider_txn_id: `csv-${createHash("sha256").update(line).digest("hex").slice(0, 24)}`,
      date,
      name: name.slice(0, 200),
      amount,
      type,
    });
  }
  return rows;
}

/** Admin-only: bulk-import transactions into an account (used for manual
 *  accounts and institutions without API history). Recomputes the
 *  account's current balance from its earliest snapshot + all txns. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const rows = parseCsv(body.data.csv);
  if (!rows.length) {
    return Response.json(
      { error: "No valid rows — expected date,name,amount[,type]" },
      { status: 400 },
    );
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: acct, error: acctErr } = await supabase
    .from("accounts")
    .select("id, current_balance")
    .eq("id", id)
    .single();
  if (acctErr || !acct) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const { error: upErr } = await supabase
    .from("transactions")
    .upsert(rows.map((r) => ({ ...r, account_id: id })), {
      onConflict: "account_id,provider_txn_id",
    });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  return Response.json({ imported: rows.length });
}
