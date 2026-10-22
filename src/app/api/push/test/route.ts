import { authErrorResponse, requireUser } from "@/lib/auth";
import { isDemoMode, isPushConfigured } from "@/lib/env";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) return Response.json({ error: "Requires Supabase" }, { status: 501 });
  if (!isPushConfigured()) {
    return Response.json({ error: "Web Push is not configured" }, { status: 501 });
  }
  try {
    const sent = await sendPushToUser(user.id, {
      title: "Finance test notification",
      body: "Web Push is working on this device.",
      url: "/settings",
    });
    return Response.json({ ok: true, sent });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to send test notification" },
      { status: 500 },
    );
  }
}
