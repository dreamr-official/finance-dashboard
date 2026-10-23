import { authErrorResponse, requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) return Response.json({ error: "Requires Supabase" }, { status: 501 });
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) return Response.json({ error: "Requires Supabase" }, { status: 501 });
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
