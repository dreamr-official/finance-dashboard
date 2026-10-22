import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  current_balance: z.number().optional(),
  type: z
    .enum([
      "checking","savings","brokerage","roth_ira","traditional_ira",
      "401k","credit_card","loan","cash","other",
    ])
    .optional(),
});

/** Admin-only: edit a manual account (rename, correct balance, retype).
 *  Balance edits also write today's snapshot. */
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
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("is_manual,type")
    .eq("id", id)
    .maybeSingle();
  if (accountError) return Response.json({ error: accountError.message }, { status: 500 });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!account.is_manual && body.data.current_balance !== undefined) {
    return Response.json({ error: "Bank-synced balances cannot be edited" }, { status: 400 });
  }
  const update = { ...body.data };
  if (
    update.current_balance !== undefined &&
    (account.type === "credit_card" || account.type === "loan")
  ) {
    update.current_balance = -Math.abs(update.current_balance);
  }
  const { error } = await supabase.from("accounts").update(update).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (update.current_balance !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: snapshotError } = await supabase.from("balance_snapshots").upsert({
      account_id: id,
      date: today,
      balance: update.current_balance,
    });
    if (snapshotError) {
      return Response.json({ error: snapshotError.message }, { status: 500 });
    }
  }
  return Response.json({ ok: true });
}

/** Admin-only: delete an account (cascades to snapshots/transactions/holdings). */
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
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
