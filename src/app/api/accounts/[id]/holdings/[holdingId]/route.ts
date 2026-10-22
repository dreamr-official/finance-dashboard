import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { holdingPatchSchema, toHoldingUpdate } from "@/lib/holdings";
import { holdingWriteError, loadManualInvestmentAccount } from "../shared";

type Context = { params: Promise<{ id: string; holdingId: string }> };

async function authorize() {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  return null;
}

async function loadHolding(id: string, holdingId: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const loaded = await loadManualInvestmentAccount(supabase, id);
  if (loaded.error) return { error: loaded.error };
  const { data: holding, error } = await supabase
    .from("holdings")
    .select("id,quantity,price")
    .eq("id", holdingId)
    .eq("account_id", id)
    .single();
  if (error && error.code !== "PGRST116") {
    return { error: Response.json({ error: error.message }, { status: 500 }) };
  }
  if (!holding) {
    return { error: Response.json({ error: "Holding not found" }, { status: 404 }) };
  }
  return { supabase, holding };
}

/** Admin-only: edit a holding on a manual investment/retirement account. */
export async function PATCH(req: Request, { params }: Context) {
  const denied = await authorize();
  if (denied) return denied;
  const { id, holdingId } = await params;
  const body = holdingPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const loaded = await loadHolding(id, holdingId);
  if (loaded.error) return loaded.error;
  const { supabase, holding } = loaded;
  const { data, error } = await supabase
    .from("holdings")
    .update(
      toHoldingUpdate(
        { quantity: Number(holding.quantity), price: Number(holding.price) },
        body.data,
      ),
    )
    .eq("id", holdingId)
    .eq("account_id", id)
    .select()
    .single();
  if (error) return holdingWriteError(error);
  return Response.json(data);
}

/** Admin-only: delete a holding from a manual investment/retirement account. */
export async function DELETE(_req: Request, { params }: Context) {
  const denied = await authorize();
  if (denied) return denied;
  const { id, holdingId } = await params;
  const loaded = await loadHolding(id, holdingId);
  if (loaded.error) return loaded.error;
  const { error } = await loaded.supabase
    .from("holdings")
    .delete()
    .eq("id", holdingId)
    .eq("account_id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
