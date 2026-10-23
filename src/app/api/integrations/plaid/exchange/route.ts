import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/integrations/registry";
import { isDemoMode } from "@/lib/env";
import { syncConnection } from "@/lib/sync";
import { findDuplicateLinkedAccount } from "@/lib/plaid-duplicates";
import { z } from "zod";

const schema = z.object({
  public_token: z.string().min(1),
  institution: z
    .object({
      name: z.string().min(1),
      institution_id: z.string().optional(),
    })
    .nullable()
    .optional(),
  accounts: z.array(z.object({
    mask: z.string().nullable().optional(),
    name: z.string(),
  })).optional(),
});

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
  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    return Response.json({ error: "TOKEN_ENCRYPTION_KEY is not set" }, { status: 501 });
  }
  const plaid = getProvider("plaid")!;
  if (!plaid.configured) {
    return Response.json({ error: "Plaid is not configured" }, { status: 501 });
  }
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const institutionName = body.data.institution?.name;
    const incomingMasks = body.data.accounts?.map((account) => account.mask ?? null) ?? [];
    if (institutionName && incomingMasks.some(Boolean)) {
      const { data: candidates, error: candidatesError } = await supabase
        .from("accounts")
        .select("mask,connection_id,institution_id")
        .not("connection_id", "is", null)
        .in("mask", incomingMasks.filter((mask): mask is string => Boolean(mask)));
      if (candidatesError) throw new Error(candidatesError.message);
      const institutionIds = [...new Set(
        (candidates ?? []).map((account) => account.institution_id).filter(Boolean),
      )];
      const { data: institutions, error: institutionsError } = institutionIds.length
        ? await supabase.from("institutions").select("id,name").in("id", institutionIds)
        : { data: [], error: null };
      if (institutionsError) throw new Error(institutionsError.message);
      const nameById = new Map(
        (institutions ?? []).map((institution) => [institution.id, institution.name]),
      );
      const duplicate = findDuplicateLinkedAccount(
        institutionName,
        incomingMasks,
        (candidates ?? []).map((account) => ({
          mask: account.mask,
          connectionId: account.connection_id,
          institutionName: nameById.get(account.institution_id) ?? "",
        })),
      );
      if (duplicate?.mask) {
        return Response.json(
          {
            error: `${institutionName} is already linked (••${duplicate.mask.slice(-4)}). Use Reconnect in Settings instead of linking it again.`,
          },
          { status: 409 },
        );
      }
    }

    let institutionId: string | null = null;
    if (institutionName) {
      const { data: existingInstitution, error: institutionError } = await supabase
        .from("institutions")
        .select("id")
        .eq("name", institutionName)
        .eq("provider", "plaid")
        .maybeSingle();
      if (institutionError) throw new Error(institutionError.message);
      if (existingInstitution) {
        institutionId = existingInstitution.id;
      } else {
        const { data: insertedInstitution, error } = await supabase
          .from("institutions")
          .insert({ name: institutionName, provider: "plaid" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        institutionId = insertedInstitution.id;
      }
    }
    const result = await plaid.completeLink({ public_token: body.data.public_token });
    const { data: connectionId, error: connectionError } = await supabase.rpc(
      "upsert_connection",
      {
        p_institution_id: institutionId,
        p_provider: "plaid",
        p_provider_item_id: result.itemId,
        p_token: result.accessToken,
        p_key: encKey,
      },
    );
    if (connectionError) throw new Error(connectionError.message);
    if (!connectionId) throw new Error("Connection was not saved");

    let synced = false;
    let warning: string | undefined;
    try {
      await syncConnection(
        supabase,
        {
          id: connectionId,
          provider: "plaid",
          institution_id: institutionId,
          sync_cursor: null,
        },
        encKey,
        false,
      );
      synced = true;
    } catch (error) {
      warning = error instanceof Error ? error.message : "Initial sync failed";
    }
    return Response.json(
      { connectionId, synced, ...(warning ? { warning } : {}) },
      { status: 201 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Plaid error" },
      { status: 502 },
    );
  }
}
