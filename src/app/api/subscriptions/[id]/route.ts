import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";
import { isoDate } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual"]).optional(),
  next_expected_date: isoDate.optional(),
  account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "canceled", "uncertain"]).optional(),
  remind_days_before: z.number().int().min(0).max(14).nullable().optional(),
});

async function handler(
  req: Request,
  params: { id: string },
  action: "patch" | "delete",
) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (action === "delete") {
    const { data, error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();
    if (error) return apiErrorResponse(error);
    if (!data) return Response.json({ error: "Subscription not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  }
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  if (!Object.keys(body.data).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
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
    .update(body.data)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();
  if (error) return apiErrorResponse(error);
  if (!data) return Response.json({ error: "Subscription not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handler(req, await ctx.params, "patch");
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handler(_req, await ctx.params, "delete");
}
