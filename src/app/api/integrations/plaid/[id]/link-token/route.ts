import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createPlaidUpdateLink } from "@/lib/integrations/plaid";
import { getProvider } from "@/lib/integrations/registry";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  if (!getProvider("plaid")?.configured) {
    return Response.json({ error: "Plaid is not configured" }, { status: 501 });
  }
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    return Response.json({ error: "TOKEN_ENCRYPTION_KEY is not set" }, { status: 501 });
  }
  const { id } = await params;
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .select("id,provider")
    .eq("id", id)
    .maybeSingle();
  if (connectionError) {
    return Response.json({ error: connectionError.message }, { status: 500 });
  }
  if (!connection) return Response.json({ error: "Connection not found" }, { status: 404 });
  if (connection.provider !== "plaid") {
    return Response.json({ error: "Connection is not a Plaid item" }, { status: 400 });
  }
  const { data: accessToken, error: tokenError } = await supabase.rpc(
    "decrypt_connection_token",
    { p_connection_id: id, p_key: encKey },
  );
  if (tokenError) return Response.json({ error: tokenError.message }, { status: 500 });
  if (!accessToken) {
    return Response.json({ error: "Connection token is unavailable" }, { status: 404 });
  }
  try {
    return Response.json(await createPlaidUpdateLink(user.id, accessToken));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Plaid error" },
      { status: 502 },
    );
  }
}
