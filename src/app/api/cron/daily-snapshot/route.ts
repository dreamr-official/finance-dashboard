import { isDemoMode } from "@/lib/env";
import { getProvider } from "@/lib/integrations/registry";
import { syncAllConnections } from "@/lib/sync";
import { getSubscriptionsToRemind } from "@/lib/subscriptions";
import { sendPushToAll } from "@/lib/push";
import { fmtCurrency } from "@/lib/format";
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
  let syncWarning: string | undefined;
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (getProvider("plaid")?.configured && encKey) {
    try {
      await syncAllConnections(supabase, encKey);
    } catch (error) {
      syncWarning = error instanceof Error ? error.message : "Plaid sync failed";
    }
  }
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
  try {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("id,name,amount,frequency,next_expected_date,date_verified,account_id,status,detected,remind_days_before")
      .eq("status", "active");
    if (subscriptionsError) throw new Error(subscriptionsError.message);
    const due = getSubscriptionsToRemind(
      (subscriptions ?? []).map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        amount: Number(subscription.amount),
        frequency: subscription.frequency,
        nextExpectedDate: subscription.next_expected_date,
        dateVerified: subscription.date_verified,
        accountId: subscription.account_id ?? undefined,
        status: subscription.status,
        detected: subscription.detected,
        remindDaysBefore: subscription.remind_days_before ?? undefined,
      })),
      new Date(),
    );
    await Promise.all(
      due.map((subscription) => {
        const days = subscription.remindDaysBefore ?? 2;
        const timing = days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`;
        return sendPushToAll({
          title: "Upcoming subscription",
          body: `${subscription.name} ${fmtCurrency(subscription.amount)} charges ${timing}`,
          url: "/subscriptions",
        });
      }),
    );
  } catch {
    // Reminder delivery must not affect the daily snapshot.
  }
  return Response.json({
    snapshotted: accounts?.length ?? 0,
    date: today,
    ...(syncWarning ? { syncWarning } : {}),
  });
}
