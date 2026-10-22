import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { rebuildAccountHistory } from "@/lib/backfill";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  try {
    const { id } = await params;
    const result = await rebuildAccountHistory(await createClient(), id);
    if (!result) return Response.json({ error: "Account not found" }, { status: 404 });
    if (!result.eligible) {
      return Response.json(
        { error: "History reconstruction is only available for cash and liability accounts." },
        { status: 400 },
      );
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not rebuild history" },
      { status: 500 },
    );
  }
}
