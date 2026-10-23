import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";
import { isoDate } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const subSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual"]),
  next_expected_date: isoDate,
  account_id: z.string().uuid().nullable().optional(),
  remind_days_before: z.number().int().min(0).max(14).optional(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const body = subSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (body.data.account_id) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", body.data.account_id)
      .maybeSingle();
    if (accountError) return apiErrorResponse(accountError);
    if (!account) return Response.json({ error: "Account not found" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({ ...body.data, detected: false, status: "active", date_verified: true })
    .select()
    .single();
  if (error) return apiErrorResponse(error);
  return Response.json(data, { status: 201 });
}
