import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const ASSET_CLASS_BY_TYPE: Record<string, string> = {
  checking: "cash",
  savings: "cash",
  cash: "cash",
  brokerage: "investment",
  roth_ira: "retirement",
  traditional_ira: "retirement",
  "401k": "retirement",
  credit_card: "liability",
  loan: "liability",
  other: "other",
};

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
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: inst, error: instErr } = await supabase
    .from("institutions")
    .upsert(
      { name: body.data.institution_name, provider: "manual" },
      { onConflict: "name" },
    )
    .select()
    .single();
  if (instErr) return Response.json({ error: instErr.message }, { status: 500 });

  const { data: acct, error: acctErr } = await supabase
    .from("accounts")
    .insert({
      institution_id: inst.id,
      name: body.data.name,
      type: body.data.type,
      asset_class: ASSET_CLASS_BY_TYPE[body.data.type],
      mask: body.data.mask,
      current_balance: body.data.opening_balance,
      is_manual: true,
      connection_status: "manual",
    })
    .select()
    .single();
  if (acctErr) return Response.json({ error: acctErr.message }, { status: 500 });

  const date =
    body.data.opening_date ?? new Date().toISOString().slice(0, 10);
  await supabase.from("balance_snapshots").upsert({
    account_id: acct.id,
    date,
    balance: body.data.opening_balance,
  });

  return Response.json(acct, { status: 201 });
}
