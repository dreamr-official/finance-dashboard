import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { z } from "zod";

const patchSchema = z.object({
  type: z
    .enum([
      "deposit",
      "withdrawal",
      "transfer_in",
      "transfer_out",
      "buy",
      "sell",
      "dividend",
      "interest",
      "fee",
      "expense",
      "income",
      "other",
    ])
    .optional(),
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional(),
});

/** Admin-only: correct a transaction's classification (e.g. mark a
 *  mislabeled deposit as a transfer). Sets type_overridden. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  if (isDemoMode()) {
    return Response.json(
      { error: "Mutations require Supabase — demo data is read-only" },
      { status: 501 },
    );
  }
  const { id } = await params;
  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ ...body.data, type_overridden: true })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
