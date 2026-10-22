import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/integrations/registry";

/** Admin-only: creates a Plaid Link token to start the connect flow. */
export async function POST() {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  const plaid = getProvider("plaid")!;
  if (!plaid.configured) {
    return Response.json(
      { error: "Plaid is not configured — set PLAID_CLIENT_ID/PLAID_SECRET (see docs/SETUP.md)" },
      { status: 501 },
    );
  }
  try {
    return Response.json(await plaid.createLink(user.id));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Plaid error" },
      { status: 502 },
    );
  }
}
