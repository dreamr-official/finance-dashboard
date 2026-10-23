import { getProvider } from "@/lib/integrations/registry";
import { classifyType } from "@/lib/transactions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDividendNotification } from "@/lib/push-messages";
import { sendPushToAll } from "@/lib/push";
import { isRecentIncomeDate } from "@/lib/investments";
import { rebuildAccountHistory } from "@/lib/backfill";
import { assetClassForType } from "@/lib/account-types";
import { chunk } from "@/lib/transaction-list";

export interface SyncConnection {
  id: string;
  provider: string;
  institution_id: string | null;
  sync_cursor?: string | null;
}

function plaidErrorCode(error: unknown) {
  return (
    (error as { response?: { data?: { error_code?: string } } })?.response?.data
      ?.error_code ?? null
  );
}

async function markSyncFailure(
  supabase: SupabaseClient,
  connectionId: string,
  error: unknown,
) {
  const needsReauth = plaidErrorCode(error) === "ITEM_LOGIN_REQUIRED";
  const message = error instanceof Error ? error.message : "Sync failed";
  const { error: connectionError } = await supabase
    .from("connections")
    .update({ status: needsReauth ? "needs_reauth" : "error", last_error: message })
    .eq("id", connectionId);
  if (connectionError) throw new Error(connectionError.message);
  const { error: accountsError } = await supabase
    .from("accounts")
    .update({ connection_status: needsReauth ? "needs_reauth" : "error" })
    .eq("connection_id", connectionId);
  if (accountsError) throw new Error(accountsError.message);
}

export async function syncConnection(
  supabase: SupabaseClient,
  conn: SyncConnection,
  encKey: string,
  notify = true,
) {
  try {
    const provider = getProvider(conn.provider);
    if (!provider) throw new Error(`Unsupported provider: ${conn.provider}`);
    const { data: token, error: tokenError } = await supabase.rpc(
      "decrypt_connection_token",
      { p_connection_id: conn.id, p_key: encKey },
    );
    if (tokenError) throw new Error(tokenError.message);
    if (!token) throw new Error("Connection token is unavailable");

    const sync = await provider.sync(token, conn.sync_cursor ?? undefined);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const accountIdByProviderId = new Map<string, string>();
    const accountNameByProviderId = new Map<string, string>();
    const newIncomeRows: {
      name: string;
      accountName: string;
      amount: number;
      type: "dividend" | "interest";
    }[] = [];

    for (const pa of sync.accounts) {
      const { data: existing, error: existingError } = await supabase
        .from("accounts")
        .select("id")
        .eq("connection_id", conn.id)
        .eq("provider_acct_id", pa.providerAccountId)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      const syncedFields = {
        current_balance: pa.balance,
        mask: pa.mask ?? null,
        connection_status: "healthy",
        last_synced_at: now,
      };
      let accountId = existing?.id as string | undefined;
      if (accountId) {
        const { error } = await supabase
          .from("accounts")
          .update(syncedFields)
          .eq("id", accountId);
        if (error) throw new Error(error.message);
      } else {
        const { data: inserted, error } = await supabase
          .from("accounts")
          .insert({
            institution_id: conn.institution_id,
            connection_id: conn.id,
            provider_acct_id: pa.providerAccountId,
            name: pa.name,
            type: pa.type,
            asset_class: assetClassForType(pa.type),
            mask: pa.mask ?? null,
            currency: pa.currency,
            current_balance: pa.balance,
            is_manual: false,
            connection_status: "healthy",
            last_synced_at: now,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        accountId = inserted.id;
      }
      if (!accountId) throw new Error("Account sync did not return an account id");
      accountIdByProviderId.set(pa.providerAccountId, accountId);
      accountNameByProviderId.set(pa.providerAccountId, pa.name);

      const { error: snapshotError } = await supabase
        .from("balance_snapshots")
        .upsert({ account_id: accountId, date: today, balance: pa.balance });
      if (snapshotError) throw new Error(snapshotError.message);
    }

    const { data: linkedAccounts, error: linkedAccountsError } = await supabase
      .from("accounts")
      .select("id,asset_class,provider_acct_id")
      .eq("connection_id", conn.id);
    if (linkedAccountsError) throw new Error(linkedAccountsError.message);
    for (const account of linkedAccounts ?? []) {
      if (
        account.provider_acct_id &&
        !accountIdByProviderId.has(account.provider_acct_id)
      ) {
        accountIdByProviderId.set(account.provider_acct_id, account.id);
      }
    }
    const allAccountIds = (linkedAccounts ?? []).map((a) => a.id as string);
    let notice = sync.notice ?? null;
    if (sync.holdingsSynced) {
      try {
        const grouped = new Map<string, (typeof sync.holdings)[number]>();
        for (const holding of sync.holdings) {
          const key = `${holding.providerAccountId}\u0000${holding.symbol}`;
          const previous = grouped.get(key);
          if (previous) {
            previous.quantity += holding.quantity;
            previous.value += holding.value;
            previous.costBasis =
              (previous.costBasis ?? 0) + (holding.costBasis ?? 0);
            previous.price = previous.quantity ? previous.value / previous.quantity : 0;
          } else {
            grouped.set(key, { ...holding });
          }
        }
        for (const account of linkedAccounts ?? []) {
          if (account.asset_class !== "investment" && account.asset_class !== "retirement") {
            continue;
          }
          const providerAccountId = [...accountIdByProviderId.entries()].find(
            ([, accountId]) => accountId === account.id,
          )?.[0];
          if (!providerAccountId) continue;
          const accountHoldings = [...grouped.values()].filter(
            (holding) => holding.providerAccountId === providerAccountId,
          );
          const { data: existingHoldings, error: existingHoldingsError } = await supabase
            .from("holdings")
            .select("id,symbol")
            .eq("account_id", account.id);
          if (existingHoldingsError) throw new Error(existingHoldingsError.message);
          const symbols = new Set(accountHoldings.map((holding) => holding.symbol));
          const staleIds = (existingHoldings ?? [])
            .filter((holding) => !symbols.has(holding.symbol))
            .map((holding) => holding.id);
          if (staleIds.length) {
            const { error } = await supabase.from("holdings").delete().in("id", staleIds);
            if (error) throw new Error(error.message);
          }
          if (accountHoldings.length) {
            const { error } = await supabase.from("holdings").upsert(
              accountHoldings.map((holding) => ({
                account_id: account.id,
                symbol: holding.symbol,
                name: holding.name,
                quantity: holding.quantity,
                price: holding.quantity ? holding.value / holding.quantity : 0,
                value: holding.value,
                cost_basis: holding.costBasis ?? null,
                asset_type: holding.assetType,
                as_of: now,
              })),
              { onConflict: "account_id,symbol" },
            );
            if (error) throw new Error(error.message);
          }
        }
      } catch (error) {
        notice = `Couldn't save holdings: ${
          error instanceof Error ? error.message : "unknown error"
        }`;
      }
    }
    const txnsByAccount = new Map<string, typeof sync.transactions>();
    let unknownAccountTransactions = 0;
    for (const txn of sync.transactions) {
      const accountId = accountIdByProviderId.get(txn.providerAccountId);
      if (!accountId) {
        unknownAccountTransactions += 1;
        continue;
      }
      const batch = txnsByAccount.get(accountId) ?? [];
      batch.push(txn);
      txnsByAccount.set(accountId, batch);
    }

    for (const [accountId, transactions] of txnsByAccount) {
      const providerTxnIds = transactions.map((t) => t.providerTxnId);
      const existingById = new Map<
        string,
        { type: string; type_overridden: boolean }
      >();
      for (const idBatch of chunk(providerTxnIds, 200)) {
        const { data: existingTransactions, error: existingTransactionsError } =
          await supabase
            .from("transactions")
            .select("provider_txn_id,type,type_overridden")
            .eq("account_id", accountId)
            .in("provider_txn_id", idBatch);
        if (existingTransactionsError) {
          throw new Error(existingTransactionsError.message);
        }
        for (const transaction of existingTransactions ?? []) {
          if (transaction.provider_txn_id) {
            existingById.set(transaction.provider_txn_id, {
              type: transaction.type,
              type_overridden: transaction.type_overridden,
            });
          }
        }
      }
      const rows = transactions.map((t) => {
        const existing = existingById.get(t.providerTxnId);
        const finalType = existing?.type_overridden
          ? existing.type
          : t.suggestedType ?? classifyType(t.name, t.amount);
        if (
          !existing &&
          (finalType === "dividend" || finalType === "interest") &&
          isRecentIncomeDate(t.date, new Date(now))
        ) {
          newIncomeRows.push({
            name: t.name,
            accountName: accountNameByProviderId.get(t.providerAccountId) ?? "your account",
            amount: t.amount,
            type: finalType,
          });
        }
        return {
          account_id: accountId,
          provider_txn_id: t.providerTxnId,
          date: t.date,
          name: t.name,
          amount: t.amount,
          type: finalType,
          type_overridden: existing?.type_overridden ?? false,
          category: t.category ?? null,
          pending: t.pending ?? false,
        };
      });
      for (const rowBatch of chunk(rows, 500)) {
        const { error } = await supabase
          .from("transactions")
          .upsert(rowBatch, { onConflict: "account_id,provider_txn_id" });
        if (error) throw new Error(error.message);
      }
    }

    if (sync.removedTxnIds.length && allAccountIds.length) {
      for (const idBatch of chunk(sync.removedTxnIds, 200)) {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .in("account_id", allAccountIds)
          .in("provider_txn_id", idBatch);
        if (error) throw new Error(error.message);
      }
    }

    if (unknownAccountTransactions) {
      notice = `${unknownAccountTransactions} transactions skipped for unknown accounts — will retry next sync`;
    }

    for (const account of linkedAccounts ?? []) {
      if (account.asset_class === "cash" || account.asset_class === "liability") {
        await rebuildAccountHistory(supabase, account.id);
      }
    }

    const { error: connectionUpdateError } = await supabase
      .from("connections")
      .update({
        sync_cursor: unknownAccountTransactions
          ? conn.sync_cursor ?? null
          : sync.cursor ?? null,
        status: "healthy",
        last_synced_at: now,
        last_error: null,
        notice,
      })
      .eq("id", conn.id);
    if (connectionUpdateError) throw new Error(connectionUpdateError.message);
    if (notify) {
      try {
        const notification = buildDividendNotification(newIncomeRows);
        if (notification) await sendPushToAll(notification);
      } catch {
        // Push delivery must not fail the sync.
      }
    }
    return { connection: conn.id, synced: sync.accounts.length };
  } catch (error) {
    await markSyncFailure(supabase, conn.id, error);
    throw error;
  }
}

export async function syncAllConnections(supabase: SupabaseClient, encKey: string) {
  const { data: connections, error } = await supabase
    .from("connections")
    .select("id,provider,institution_id,sync_cursor")
    .in("status", ["healthy", "error"]);
  if (error) throw new Error(error.message);

  const results: { connection: string; synced?: number; error?: string }[] = [];
  for (const conn of connections ?? []) {
    try {
      results.push(await syncConnection(supabase, conn, encKey));
    } catch (error) {
      results.push({
        connection: conn.id,
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }
  return results;
}
