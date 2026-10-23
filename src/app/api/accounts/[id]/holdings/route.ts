import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { holdingCreateSchema, toHoldingInsert } from "@/lib/manual-holdings";
import { holdingWriteError, loadManualInvestmentAccount } from "./shared";

/** Admin-only: add a holding to a manual investment/retirement account.
 *  The account's current_balance is left unchanged. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const { id } = await params;
  const body = holdingCreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const loaded = await loadManualInvestmentAccount(supabase, id);
  if (loaded.error) return loaded.error;

  const { data: holding, error } = await supabase
    .from("holdings")
    .insert({ account_id: id, ...toHoldingInsert(body.data) })
    .select()
    .single();
  if (error) return holdingWriteError(error);
  return Response.json(holding, { status: 201 });
}
