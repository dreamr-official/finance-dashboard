import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { syncAllConnections } from "@/lib/sync";

export async function POST() {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    return Response.json({ error: "TOKEN_ENCRYPTION_KEY is not set" }, { status: 501 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    return Response.json({ results: await syncAllConnections(supabase, encKey) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
