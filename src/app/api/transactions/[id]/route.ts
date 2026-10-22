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
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ ...body.data, type_overridden: true })
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
  const { data: txn } = await supabase
    .from("transactions")
    .select("account_id, amount")
    .eq("id", id)
    .single();
  if (!txn) return Response.json({ error: "Not found" }, { status: 404 });
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const { data: acct } = await supabase
    .from("accounts")
    .select("current_balance")
    .eq("id", txn.account_id)
    .single();
  if (acct) {
    const balance = Number(acct.current_balance) - Number(txn.amount);
    await supabase
      .from("accounts")
      .update({ current_balance: balance })
      .eq("id", txn.account_id);
  }
  return new Response(null, { status: 204 });
}
