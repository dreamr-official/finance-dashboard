import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

/** Admin-only: manual refresh. Enqueues a sync_job per active connection;
 *  the scheduled worker (Vercel cron / Supabase edge fn) picks them up. */
export async function POST() {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: conns, error } = await supabase
    .from("connections")
    .select("id")
    .in("status", ["healthy", "error"]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (conns?.length) {
    const { error: insErr } = await supabase
      .from("sync_jobs")
      .insert(conns.map((c) => ({ connection_id: c.id })));
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }
  return Response.json({ queued: conns?.length ?? 0 });
}
