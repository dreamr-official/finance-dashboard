import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { appToday } from "@/lib/dates";
import { isoDate } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const schema = z.object({
  date: isoDate,
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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }
  const today = appToday();
  if (parsed.data.date >= today) {
    return Response.json({ error: "Date must be earlier than today." }, { status: 400 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,asset_class")
    .eq("id", id)
    .maybeSingle();
  if (accountError) return apiErrorResponse(accountError);
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  const balance =
    account.asset_class === "liability"
      ? -Math.abs(parsed.data.balance)
      : parsed.data.balance;
  const { error } = await supabase.from("balance_snapshots").upsert(
    { account_id: id, date: parsed.data.date, balance, source: "manual" },
    { onConflict: "account_id,date" },
  );
  if (error) return apiErrorResponse(error);
  return Response.json({ ok: true });
}
