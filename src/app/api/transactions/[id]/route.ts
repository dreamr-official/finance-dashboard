import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const patchSchema = z.object({
  type: z
    .enum([
      "deposit","withdrawal","transfer_in","transfer_out","buy","sell",
      "dividend","interest","fee","expense","income","other",
    ])
    .optional(),
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional(),
  taxYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

/** Admin-only: correct a transaction's classification (e.g. mark a
 *  mislabeled deposit as a transfer). Sets type_overridden. */
export async function PATCH(
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
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { taxYear, ...rest } = body.data;
  const update = {
    ...rest,
    ...(taxYear !== undefined ? { tax_year: taxYear } : {}),
    ...(rest.type !== undefined ? { type_overridden: true } : {}),
  };
  if (!Object.keys(update).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (taxYear !== undefined) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .select("id,type,date,account_id")
      .eq("id", id)
      .maybeSingle();
    if (transactionError) {
      return Response.json({ error: transactionError.message }, { status: 500 });
    }
    if (!transaction) return Response.json({ error: "Not found" }, { status: 404 });
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("type")
      .eq("id", transaction.account_id)
      .maybeSingle();
    if (accountError) {
      return Response.json({ error: accountError.message }, { status: 500 });
    }
    if (transaction.type !== "deposit" || account?.type !== "roth_ira") {
      return Response.json(
        { error: "Tax year can only be set for Roth IRA deposits" },
        { status: 400 },
      );
    }
    const dateYear = Number(transaction.date.slice(0, 4));
    if (taxYear !== undefined && taxYear !== null &&
        taxYear !== dateYear && taxYear !== dateYear - 1) {
      return Response.json(
        { error: "Tax year must match the transaction year or the previous year" },
        { status: 400 },
      );
    }
  }
  const { error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Admin-only: delete a transaction and reverse its effect on the balance. */
export async function DELETE(
  _req: Request,
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
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: txn, error: txnError } = await supabase
    .from("transactions")
    .select("id,account_id,amount,transfer_pair_id")
    .eq("id", id)
    .single();
  if (txnError && txnError.code !== "PGRST116") {
    return Response.json({ error: txnError.message }, { status: 500 });
  }
  if (!txn) return Response.json({ error: "Not found" }, { status: 404 });
  let txns = [txn];
  if (txn.transfer_pair_id) {
    const { data: pair, error: pairError } = await supabase
      .from("transactions")
      .select("id,account_id,amount,transfer_pair_id")
      .eq("transfer_pair_id", txn.transfer_pair_id);
    if (pairError) return Response.json({ error: pairError.message }, { status: 500 });
    txns = pair ?? [txn];
  }
  const accountIds = [...new Set(txns.map((row) => row.account_id))];
  const { data: accounts, error: accountError } = await supabase
    .from("accounts")
    .select("id,current_balance,is_manual")
    .in("id", accountIds);
  if (accountError) return Response.json({ error: accountError.message }, { status: 500 });
  const today = new Date().toISOString().slice(0, 10);
  for (const account of accounts ?? []) {
    if (!account.is_manual) continue;
    const delta = txns
      .filter((row) => row.account_id === account.id)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const balance = Number(account.current_balance) - delta;
    const { error: balanceError } = await supabase
      .from("accounts")
      .update({ current_balance: balance })
      .eq("id", account.id);
    if (balanceError) {
      return Response.json({ error: balanceError.message }, { status: 500 });
    }
    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert({ account_id: account.id, date: today, balance });
    if (snapshotError) {
      return Response.json({ error: snapshotError.message }, { status: 500 });
    }
  }
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("id", txns.map((row) => row.id));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
