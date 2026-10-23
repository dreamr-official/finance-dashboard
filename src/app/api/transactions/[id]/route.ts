import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { rebuildAccountHistory } from "@/lib/backfill";
import { normalizeTransactionAmount } from "@/lib/transactions";
import { apiErrorResponse } from "@/lib/api-error";
import { z } from "zod";
import { appToday } from "@/lib/dates";

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
  const update: Record<string, unknown> = {
    ...rest,
    ...(taxYear !== undefined ? { tax_year: taxYear } : {}),
    ...(rest.type !== undefined ? { type_overridden: true } : {}),
  };
  if (!Object.keys(update).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  let transaction: {
    id: string;
    type: string;
    date: string;
    account_id: string;
    amount: number;
    transfer_pair_id: string | null;
  } | null = null;
  let account: {
    type: string;
    is_manual: boolean;
    current_balance: number;
  } | null = null;
  if (taxYear !== undefined || Object.keys(rest).length > 0) {
    const { data, error: transactionError } = await supabase
      .from("transactions")
      .select("id,type,date,account_id,amount,transfer_pair_id")
      .eq("id", id)
      .maybeSingle();
    if (transactionError) {
      return apiErrorResponse(transactionError);
    }
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });
    transaction = data;
    const { data: accountData, error: accountError } = await supabase
      .from("accounts")
      .select("type,is_manual,current_balance")
      .eq("id", data.account_id)
      .maybeSingle();
    if (accountError) {
      return apiErrorResponse(accountError);
    }
    if (!accountData) return Response.json({ error: "Account not found" }, { status: 404 });
    account = accountData;
  }
  if (taxYear !== undefined) {
    if (transaction?.type !== "deposit" || account?.type !== "roth_ira") {
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
  let balanceDelta = 0;
  if (rest.type !== undefined && transaction && account) {
    const normalized = normalizeTransactionAmount(Number(transaction.amount), rest.type);
    const currentAmount = Number(transaction.amount);
    const changesSign =
      currentAmount !== 0 && normalized !== 0 && Math.sign(currentAmount) !== Math.sign(normalized);
    if ((!account.is_manual || transaction.transfer_pair_id) && changesSign) {
      return Response.json(
        { error: "Changing this type would reverse the transaction's sign" },
        { status: 400 },
      );
    }
    if (account.is_manual && !transaction.transfer_pair_id) {
      balanceDelta = normalized - currentAmount;
      update.amount = normalized;
    }
  }
  const { error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id);
  if (error) return apiErrorResponse(error);
  if (rest.type !== undefined && transaction && account?.is_manual && !transaction.transfer_pair_id) {
    const balance = Number(account.current_balance) + balanceDelta;
    const { error: balanceError } = await supabase
      .from("accounts")
      .update({ current_balance: balance })
      .eq("id", transaction.account_id);
    if (balanceError) return apiErrorResponse(balanceError);
    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert({ account_id: transaction.account_id, date: appToday(), balance, source: "manual" });
    if (snapshotError) return apiErrorResponse(snapshotError);
    await rebuildAccountHistory(supabase, transaction.account_id);
  }
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
    return apiErrorResponse(txnError);
  }
  if (!txn) return Response.json({ error: "Not found" }, { status: 404 });
  let txns = [txn];
  if (txn.transfer_pair_id) {
    const { data: pair, error: pairError } = await supabase
      .from("transactions")
      .select("id,account_id,amount,transfer_pair_id")
      .eq("transfer_pair_id", txn.transfer_pair_id);
    if (pairError) return apiErrorResponse(pairError);
    txns = pair ?? [txn];
  }
  const accountIds = [...new Set(txns.map((row) => row.account_id))];
  const { data: accounts, error: accountError } = await supabase
    .from("accounts")
    .select("id,current_balance,is_manual")
    .in("id", accountIds);
  if (accountError) return apiErrorResponse(accountError);
  const today = appToday();
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
      return apiErrorResponse(balanceError);
    }
    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert({ account_id: account.id, date: today, balance, source: "manual" });
    if (snapshotError) {
      return apiErrorResponse(snapshotError);
    }
  }
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("id", txns.map((row) => row.id));
  if (error) return apiErrorResponse(error);
  for (const accountId of accountIds) {
    await rebuildAccountHistory(supabase, accountId);
  }
  return new Response(null, { status: 204 });
}
