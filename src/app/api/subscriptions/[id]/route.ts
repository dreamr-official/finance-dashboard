import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "annual"]).optional(),
  next_expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "canceled", "uncertain"]).optional(),
  remind_days_before: z.number().int().min(0).max(90).nullable().optional(),
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
    const { error } = await supabase.from("subscriptions").delete().eq("id", params.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return new Response(null, { status: 204 });
  }
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { error } = await supabase
    .from("subscriptions")
    .update(body.data)
    .eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handler(req, await ctx.params, "patch");
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handler(_req, await ctx.params, "delete");
}
