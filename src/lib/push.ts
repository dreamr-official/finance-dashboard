import webpush from "web-push";
import { isPushConfigured } from "@/lib/env";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function sendToRows(rows: PushSubscriptionRow[], payload: PushPayload) {
  if (!isPushConfigured() || rows.length === 0) return 0;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const supabase = await serviceClient();
  let sent = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", row.id);
        }
      }
    }),
  );
  return sent;
}

export async function sendPushToAll(payload: PushPayload) {
  if (!isPushConfigured()) return 0;
  const supabase = await serviceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");
  if (error) throw new Error(error.message);
  return sendToRows((data ?? []) as PushSubscriptionRow[], payload);
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!isPushConfigured()) return 0;
  const supabase = await serviceClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return sendToRows((data ?? []) as PushSubscriptionRow[], payload);
}
