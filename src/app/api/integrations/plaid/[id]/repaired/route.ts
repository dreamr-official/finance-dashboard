import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "Supabase service configuration is missing" }, { status: 501 });
  }
  const { id } = await params;
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey);
  const { data: connection, error: lookupError } = await supabase
    .from("connections")
    .select("id,provider")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  if (!connection) return Response.json({ error: "Connection not found" }, { status: 404 });
  if (connection.provider !== "plaid") {
    return Response.json({ error: "Connection is not a Plaid item" }, { status: 400 });
  }
  const { error: connectionError } = await supabase
    .from("connections")
    .update({ status: "healthy", last_error: null })
    .eq("id", id);
  if (connectionError) {
    return Response.json({ error: connectionError.message }, { status: 500 });
  }
  const { error: accountsError } = await supabase
    .from("accounts")
    .update({ connection_status: "healthy" })
    .eq("connection_id", id);
  if (accountsError) return Response.json({ error: accountsError.message }, { status: 500 });
  return Response.json({ ok: true });
}
