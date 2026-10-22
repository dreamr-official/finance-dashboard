import { isDemoMode } from "@/lib/env";
import { timingSafeEqual } from "crypto";

/**
 * Vercel cron (daily): records today's balance per account into
 * balance_snapshots. Authenticated by CRON_SECRET, not a user session.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    secret &&
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoMode()) return Response.json({ skipped: "demo mode" });

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, current_balance");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const { error: upErr } = await supabase.from("balance_snapshots").upsert(
    (accounts ?? []).map((a) => ({
      account_id: a.id,
      date: today,
      balance: a.current_balance,
    })),
  );
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  return Response.json({ snapshotted: accounts?.length ?? 0, date: today });
}
