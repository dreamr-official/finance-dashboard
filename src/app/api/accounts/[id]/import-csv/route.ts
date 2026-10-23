import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { parseCsv } from "@/lib/csv-import";
import { z } from "zod";

const schema = z.object({
  csv: z.string().min(1).max(2_000_000),
});

/** Admin-only: bulk-import transactions into a manual account. */
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
  const { rows, skipped } = parseCsv(body.data.csv);
  if (!rows.length) {
    return Response.json({ imported: 0, skipped });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: acct, error: acctErr } = await supabase
    .from("accounts")
    .select("id,current_balance,is_manual")
    .eq("id", id)
    .maybeSingle();
  if (acctErr) return Response.json({ error: acctErr.message }, { status: 500 });
  if (!acct) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!acct.is_manual) {
    return Response.json({ error: "CSV imports are only available for manual accounts" }, { status: 400 });
  }

  const providerTxnIds = rows.map((row) => row.provider_txn_id);
  const { data: existingRows, error: existingError } = await supabase
    .from("transactions")
    .select("provider_txn_id,amount,type,type_overridden")
    .eq("account_id", id)
    .in("provider_txn_id", providerTxnIds);
  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
  const existingById = new Map((existingRows ?? []).map((row) => [row.provider_txn_id, row]));
  const delta = rows.reduce((sum, row) => {
    const existing = existingById.get(row.provider_txn_id);
    return sum + row.amount - (existing ? Number(existing.amount) : 0);
  }, 0);
  const upsertRows = rows.map((row) => {
    const existing = existingById.get(row.provider_txn_id);
    return {
      ...row,
      account_id: id,
      type: existing?.type_overridden ? existing.type : row.type,
      type_overridden: existing?.type_overridden ?? false,
    };
  });

  const { error: upErr } = await supabase
    .from("transactions")
    .upsert(upsertRows, {
      onConflict: "account_id,provider_txn_id",
    });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  const balance = Number(acct.current_balance) + delta;
  const { error: balanceError } = await supabase
    .from("accounts")
    .update({ current_balance: balance })
    .eq("id", id);
  if (balanceError) return Response.json({ error: balanceError.message }, { status: 500 });
  const today = new Date().toISOString().slice(0, 10);
  const { error: snapshotError } = await supabase
    .from("balance_snapshots")
    .upsert({ account_id: id, date: today, balance });
  if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 500 });

  return Response.json({ imported: rows.length, skipped });
}
