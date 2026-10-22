import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { plaidClient } from "@/lib/integrations/plaid";

export async function DELETE(
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
  const { id } = await params;
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    return Response.json({ error: "TOKEN_ENCRYPTION_KEY is not set" }, { status: 501 });
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: token, error: tokenError } = await supabase.rpc(
    "decrypt_connection_token",
    { p_connection_id: id, p_key: encKey },
  );
  if (tokenError) return Response.json({ error: tokenError.message }, { status: 500 });
  if (token) {
    try {
      await plaidClient().itemRemove({ access_token: token });
    } catch {
      // Remove the local connection even if Plaid is unavailable.
    }
  }
  const { error: accountsError } = await supabase
    .from("accounts")
    .update({
      is_manual: true,
      connection_status: "manual",
      connection_id: null,
    })
    .eq("connection_id", id);
  if (accountsError) {
    return Response.json({ error: accountsError.message }, { status: 500 });
  }
  const { error: deleteError } = await supabase.from("connections").delete().eq("id", id);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
