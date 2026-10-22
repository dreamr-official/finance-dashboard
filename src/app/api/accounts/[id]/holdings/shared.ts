import type { SupabaseClient } from "@supabase/supabase-js";
import { canManageHoldings } from "@/lib/holdings";
import type { AssetClass } from "@/lib/types";

/** Loads an account and returns an error response unless it accepts manual holdings. */
export async function loadManualInvestmentAccount(supabase: SupabaseClient, id: string) {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id,is_manual,asset_class")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") {
    return { error: Response.json({ error: error.message }, { status: 500 }) };
  }
  if (!account) {
    return { error: Response.json({ error: "Account not found" }, { status: 404 }) };
  }
  if (!account.is_manual) {
    return {
      error: Response.json(
        { error: "Holdings on synced accounts come from Plaid and would be overwritten" },
        { status: 409 },
      ),
    };
  }
  if (!canManageHoldings({ isManual: true, assetClass: account.asset_class as AssetClass })) {
    return {
      error: Response.json(
        { error: "Holdings are only supported on investment or retirement accounts" },
        { status: 409 },
      ),
    };
  }
  return { account };
}

export function holdingWriteError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return Response.json(
      { error: "This account already has a holding with that symbol" },
      { status: 409 },
    );
  }
  return Response.json({ error: error.message }, { status: 500 });
}
