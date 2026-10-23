import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { ASSET_CLASS } from "@/lib/account-types";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(100),
  institution_name: z.string().min(1).max(200),
  type: z.enum([
    "checking",
    "savings",
    "brokerage",
    "roth_ira",
    "traditional_ira",
    "401k",
    "credit_card",
    "loan",
    "cash",
    "other",
  ]),
  opening_balance: z.number(),
  opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mask: z.string().max(4).optional(),
});

/** Admin-only: create a manual account (institutions that can't connect
 *  via API). Opening balance seeds balance_snapshots so net-worth history
 *  stays coherent. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: existingInstitution, error: existingInstitutionError } = await supabase
    .from("institutions")
    .select("id")
    .eq("name", body.data.institution_name)
    .eq("provider", "manual")
    .maybeSingle();
  if (existingInstitutionError) {
    return Response.json({ error: existingInstitutionError.message }, { status: 500 });
  }
  let institutionId = existingInstitution?.id;
  if (!institutionId) {
    const { data: inst, error: instErr } = await supabase
      .from("institutions")
      .insert({ name: body.data.institution_name, provider: "manual" })
      .select("id")
      .single();
    if (instErr) return Response.json({ error: instErr.message }, { status: 500 });
    institutionId = inst.id;
  }

  const openingBalance =
    body.data.type === "credit_card" || body.data.type === "loan"
      ? -Math.abs(body.data.opening_balance)
      : body.data.opening_balance;

  const { data: acct, error: acctErr } = await supabase
    .from("accounts")
    .insert({
      institution_id: institutionId,
      name: body.data.name,
      type: body.data.type,
      asset_class: ASSET_CLASS[body.data.type],
      mask: body.data.mask,
      current_balance: openingBalance,
      is_manual: true,
      connection_status: "manual",
    })
    .select()
    .single();
  if (acctErr) return Response.json({ error: acctErr.message }, { status: 500 });

  const date =
    body.data.opening_date ?? new Date().toISOString().slice(0, 10);
  const { error: snapshotError } = await supabase.from("balance_snapshots").upsert({
    account_id: acct.id,
    date,
    balance: openingBalance,
  });
  if (snapshotError) {
    return Response.json({ error: snapshotError.message }, { status: 500 });
  }

  return Response.json(acct, { status: 201 });
}
