import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: acct } = await supabase
    .from("accounts")
    .select("id, current_balance")
    .eq("id", id)
    .single();
  if (!acct) return Response.json({ error: "Account not found" }, { status: 404 });

  const { data: txn, error } = await supabase
    .from("transactions")
    .insert({ account_id: id, ...body.data })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const balance = Number(acct.current_balance) + body.data.amount;
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("accounts").update({ current_balance: balance }).eq("id", id);
  await supabase
    .from("balance_snapshots")
    .upsert({ account_id: id, date: today, balance });

  return Response.json(txn, { status: 201 });
}
