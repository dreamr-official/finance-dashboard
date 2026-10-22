import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  balance: z.number().finite(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const normalizedDate = new Date(`${parsed.data.date}T00:00:00Z`);
  if (
    parsed.data.date >= today ||
    Number.isNaN(normalizedDate.getTime()) ||
    normalizedDate.toISOString().slice(0, 10) !== parsed.data.date
  ) {
    return Response.json({ error: "Date must be earlier than today." }, { status: 400 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,asset_class")
    .eq("id", id)
    .maybeSingle();
  if (accountError) return Response.json({ error: accountError.message }, { status: 500 });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  const balance =
    account.asset_class === "liability"
      ? -Math.abs(parsed.data.balance)
      : parsed.data.balance;
  const { error } = await supabase.from("balance_snapshots").upsert(
    { account_id: id, date: parsed.data.date, balance, source: "recorded" },
    { onConflict: "account_id,date" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
