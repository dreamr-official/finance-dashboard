import { createClient } from "../supabase/server";
import type { Dataset } from "./types";
import type { Account, Transaction } from "../types";

/**
 * Reads the dataset from Supabase. RLS already restricts rows to the
 * allowlisted caller; this maps DB rows to domain types.
 */
export async function fetchDataset(): Promise<Dataset> {
  const supabase = await createClient();
  const [inst, accts, snaps, txns, holds, subs, connections] = await Promise.all([
    supabase.from("institutions").select("*"),
    supabase.from("accounts").select("*"),
    supabase.from("balance_snapshots").select("*").order("date"),
    supabase.from("transactions").select("*").order("date", { ascending: false }).limit(5000),
    supabase.from("holdings").select("*"),
    supabase.from("subscriptions").select("*"),
    supabase.from("connection_notices").select("id,notice"),
  ]);
  for (const r of [inst, accts, snaps, txns, holds, subs, connections]) {
    if (r.error) throw new Error(`Supabase query failed: ${r.error.message}`);
  }
  const noticeByConnectionId = new Map(
    (connections.data ?? []).map((connection) => [connection.id, connection.notice]),
  );
  return {
    institutions: (inst.data ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      provider: i.provider,
      logoUrl: i.logo_url ?? undefined,
    })),
    accounts: (accts.data ?? []).map(
      (a): Account => ({
        id: a.id,
        institutionId: a.institution_id,
        name: a.name,
        type: a.type,
        assetClass: a.asset_class,
        mask: a.mask ?? undefined,
        currency: a.currency,
        currentBalance: Number(a.current_balance),
        lastSyncedAt: a.last_synced_at,
        isManual: a.is_manual,
        connectionStatus: a.connection_status,
        connectionNotice: a.connection_id
          ? noticeByConnectionId.get(a.connection_id) ?? null
          : null,
      }),
    ),
    snapshots: (snaps.data ?? []).map((s) => ({
      accountId: s.account_id,
      date: s.date,
      balance: Number(s.balance),
    })),
    transactions: (txns.data ?? []).map(
      (t): Transaction => ({
        id: t.id,
        accountId: t.account_id,
        date: t.date,
        name: t.name,
        amount: Number(t.amount),
        type: t.type,
        transferPairId: t.transfer_pair_id ?? undefined,
        typeOverridden: t.type_overridden,
        pending: t.pending,
        category: t.category ?? undefined,
      }),
    ),
    holdings: (holds.data ?? []).map((h) => ({
      id: h.id,
      accountId: h.account_id,
      symbol: h.symbol,
      name: h.name,
      quantity: Number(h.quantity),
      price: Number(h.price),
      value: Number(h.value),
      costBasis: h.cost_basis == null ? undefined : Number(h.cost_basis),
      assetType: h.asset_type,
    })),
    subscriptions: (subs.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      logoUrl: s.logo_url ?? undefined,
      amount: Number(s.amount),
      frequency: s.frequency,
      nextExpectedDate: s.next_expected_date,
      dateVerified: s.date_verified,
      accountId: s.account_id ?? undefined,
      status: s.status,
      detected: s.detected,
      remindDaysBefore: s.remind_days_before ?? undefined,
    })),
  };
}
