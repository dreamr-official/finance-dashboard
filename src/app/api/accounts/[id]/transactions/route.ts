import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { rebuildAccountHistory } from "@/lib/backfill";
import { normalizeTransactionAmount } from "@/lib/transactions";
import { z } from "zod";
import { appToday, shiftDate } from "@/lib/dates";
import { isoDate } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const schema = z.object({
  date: isoDate,
  name: z.string().min(1).max(200),
  amount: z.number(),
  type: z.enum([
    "deposit","withdrawal","transfer_in","transfer_out","buy","sell",
    "dividend","interest","fee","expense","income","other",
  ]),
  category: z.string().max(100).optional(),
});

/** Admin-only: add a manual transaction to an account. Also updates the
 *  account's current_balance and today's snapshot so net worth stays
 *  consistent with what the user entered. */
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
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const today = appToday();
  if (body.data.date > shiftDate(today, 7)) {
    return Response.json(
      { error: "Transaction date cannot be more than 7 days in the future." },
      { status: 400 },
    );
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: acct, error: accountError } = await supabase
    .from("accounts")
    .select("id,current_balance,is_manual")
    .eq("id", id)
    .single();
  if (accountError && accountError.code !== "PGRST116") {
    return apiErrorResponse(accountError);
  }
  if (!acct) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!acct.is_manual) {
    return Response.json({ error: "Synced accounts get transactions from Plaid" }, { status: 409 });
  }

  const amount = normalizeTransactionAmount(body.data.amount, body.data.type);

  const { data: txn, error } = await supabase
    .from("transactions")
    .insert({ account_id: id, ...body.data, amount })
    .select()
    .single();
  if (error) return apiErrorResponse(error);

  const balance = Number(acct.current_balance) + amount;
  const { error: balanceError } = await supabase
    .from("accounts")
    .update({ current_balance: balance })
    .eq("id", id);
  if (balanceError) {
    return apiErrorResponse(balanceError);
  }
  const { error: snapshotError } = await supabase
    .from("balance_snapshots")
    .upsert({ account_id: id, date: today, balance, source: "manual" });
  if (snapshotError) {
    return apiErrorResponse(snapshotError);
  }
  await rebuildAccountHistory(supabase, id);

  return Response.json(txn, { status: 201 });
}
