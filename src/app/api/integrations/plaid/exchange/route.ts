import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/integrations/registry";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const schema = z.object({ public_token: z.string().min(1) });

/** Admin-only: exchange Plaid public_token; stores the encrypted access
 *  token and kicks off an initial sync (Phase 2 pipeline). */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Requires Supabase" }, { status: 501 });
  }
  const plaid = getProvider("plaid")!;
  if (!plaid.configured) {
    return Response.json({ error: "Plaid is not configured" }, { status: 501 });
  }
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  try {
    const result = await plaid.completeLink(body.data);
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Plaid error" },
      { status: 502 },
    );
  }
}
