import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { deriveAccountTypeUpdate } from "@/lib/account-types";
import { z } from "zod";
import { appToday } from "@/lib/dates";
import { apiErrorResponse } from "@/lib/api-error";

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
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("is_manual,type,asset_class,current_balance")
    .eq("id", id)
    .maybeSingle();
  if (accountError) return apiErrorResponse(accountError);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (!account.is_manual && body.data.current_balance !== undefined) {
    return Response.json({ error: "Bank-synced balances cannot be edited" }, { status: 400 });
  }
  const update = deriveAccountTypeUpdate(
    {
      type: account.type,
      assetClass: account.asset_class,
      currentBalance: Number(account.current_balance),
    },
    body.data,
  );
  const { error } = await supabase.from("accounts").update(update).eq("id", id);
  if (error) return apiErrorResponse(error);
  if (update.current_balance !== undefined) {
    const today = appToday();
    const { error: snapshotError } = await supabase.from("balance_snapshots").upsert({
      account_id: id,
      date: today,
      balance: update.current_balance,
      source: "manual",
    });
    if (snapshotError) {
      return apiErrorResponse(snapshotError);
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
  const { data, error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return apiErrorResponse(error);
  if (!data) return Response.json({ error: "Account not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
