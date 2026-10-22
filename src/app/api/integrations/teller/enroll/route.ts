import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  access_token: z.string().min(1),
  enrollment_id: z.string().min(1),
  institution_name: z.string().min(1).max(200),
});

/**
 * Admin-only: called after Teller Connect succeeds. Stores the enrollment
 * with the access token symmetrically encrypted (pgp_sym_encrypt keyed by
 * TOKEN_ENCRYPTION_KEY — server env only, never shipped to the client).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  void user;
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    return Response.json(
      { error: "TOKEN_ENCRYPTION_KEY is not set — see docs/SETUP.md" },
      { status: 501 },
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: inst, error: instErr } = await supabase
    .from("institutions")
    .upsert({ name: body.data.institution_name, provider: "teller" }, { onConflict: "name" })
    .select()
    .single();
  if (instErr) return Response.json({ error: instErr.message }, { status: 500 });

  const { data: conn, error: connErr } = await supabase.rpc("upsert_connection", {
    p_institution_id: inst.id,
    p_provider: "teller",
    p_provider_item_id: body.data.enrollment_id,
    p_token: body.data.access_token,
    p_key: key,
  });
  if (connErr) return Response.json({ error: connErr.message }, { status: 500 });
  return Response.json({ connection_id: conn }, { status: 201 });
}
