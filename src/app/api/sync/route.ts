import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getProvider } from "@/lib/integrations/registry";

const ASSET_CLASS: Record<string, string> = {
  checking: "cash",
  savings: "cash",
  cash: "cash",
  brokerage: "investment",
  roth_ira: "retirement",
  credit_card: "liability",
};

/** Classify a provider transaction for contribution accounting. Never
 *  guesses "deposit" — mislabeled deposits corrupt contribution tracking,
 *  so ambiguous credits land as income/other for the admin to reclassify. */
function classifyType(name: string, amount: number): string {
  if (/dividend/i.test(name)) return "dividend";
  if (/interest/i.test(name)) return "interest";
  if (/transfer|xfer|zelle|venmo/i.test(name)) {
    return amount >= 0 ? "transfer_in" : "transfer_out";
  }
  return amount >= 0 ? "income" : "expense";
}

/**
 * Admin-only: runs a sync for every healthy Teller connection (Plaid/
 * SnapTrade land here in Phase 2 — same job shape). Idempotent: accounts
 * upsert by provider_acct_id, transactions by provider_txn_id.
 */
export async function POST() {
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

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conns, error } = await supabase
    .from("connections")
    .select("id, provider, institution_id")
    .in("status", ["healthy", "error"]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: { connection: string; synced?: number; error?: string }[] = [];

  for (const conn of conns ?? []) {
    try {
      if (conn.provider !== "teller") {
        results.push({ connection: conn.id, error: `${conn.provider} sync not implemented yet` });
        continue;
      }
      const teller = getProvider("teller")!;
      const { data: token } = await supabase.rpc("decrypt_connection_token", {
        p_connection_id: conn.id,
        p_key: encKey,
      });
      if (!token) throw new Error("no token");

      const sync = await teller.sync(token);
      const today = new Date().toISOString().slice(0, 10);

      for (const pa of sync.accounts) {
        const { data: acct, error: aErr } = await supabase
          .from("accounts")
          .upsert(
            {
              institution_id: conn.institution_id,
              connection_id: conn.id,
              provider_acct_id: pa.providerAccountId,
              name: pa.name,
              type: pa.type,
              asset_class: ASSET_CLASS[pa.type] ?? "other",
              mask: pa.mask,
              currency: pa.currency,
              current_balance: pa.balance,
              connection_status: "healthy",
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "connection_id,provider_acct_id" },
          )
          .select("id")
          .single();
        if (aErr) throw new Error(aErr.message);

        await supabase.from("balance_snapshots").upsert({
          account_id: acct.id,
          date: today,
          balance: pa.balance,
        });

        const txns = sync.transactions
          .filter((t) => t.providerAccountId === pa.providerAccountId)
          .map((t) => ({
            account_id: acct.id,
            provider_txn_id: t.providerTxnId,
            date: t.date,
            name: t.name,
            amount: t.amount,
            type: classifyType(t.name, t.amount),
            pending: t.pending ?? false,
          }));
        if (txns.length) {
          await supabase
            .from("transactions")
            .upsert(txns, { onConflict: "account_id,provider_txn_id" });
        }
      }

      await supabase
        .from("connections")
        .update({ status: "healthy", last_synced_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
      results.push({ connection: conn.id, synced: sync.accounts.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      await supabase
        .from("connections")
        .update({ status: "error", last_error: msg })
        .eq("id", conn.id);
      results.push({ connection: conn.id, error: msg });
    }
  }

  return Response.json({ results });
}
