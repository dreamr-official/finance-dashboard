import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./data/fetch-all";
import { appToday, shiftDate } from "./dates";

export interface HistoryTransaction {
  date: string;
  amount: number;
  pending: boolean;
}

export interface HistoryAnchor {
  date: string;
  balance: number;
}

export function reconstructBalances(
  currentBalance: number,
  transactions: HistoryTransaction[],
  today: Date | string = appToday(),
  anchors: HistoryAnchor[] = [],
): { date: string; balance: number }[] {
  const todayDate = typeof today === "string" ? today : appToday(today);
  const eligible = transactions.filter(
    (transaction) => !transaction.pending && transaction.date <= todayDate,
  );
  if (!eligible.length) return [];
  const earliest = eligible.reduce(
    (date, transaction) => (transaction.date < date ? transaction.date : date),
    eligible[0].date,
  );
  const preTransaction = shiftDate(earliest, -1);
  const windowStart = shiftDate(todayDate, -730);
  const start = preTransaction > windowStart
    ? preTransaction
    : windowStart;
  const byDate = new Map<string, number>();
  for (const transaction of eligible) {
    byDate.set(
      transaction.date,
      (byDate.get(transaction.date) ?? 0) + transaction.amount,
    );
  }
  const anchorByDate = new Map(anchors.map((anchor) => [anchor.date, anchor.balance]));

  let balance = currentBalance;
  let date = shiftDate(todayDate, -1);
  const reconstructed: { date: string; balance: number }[] = [];
  while (date >= start) {
    balance -= byDate.get(shiftDate(date, 1)) ?? 0;
    const anchor = anchorByDate.get(date);
    if (anchor !== undefined) balance = anchor;
    else reconstructed.push({ date, balance });
    date = shiftDate(date, -1);
  }
  return reconstructed.reverse();
}

export async function rebuildAccountHistory(
  supabase: SupabaseClient,
  accountId: string,
  today: Date | string = appToday(),
): Promise<{ eligible: boolean; reconstructed: number } | null> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,asset_class,current_balance,is_manual")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account) return null;
  if (account.asset_class !== "cash" && account.asset_class !== "liability") {
    return { eligible: false, reconstructed: 0 };
  }

  const todayDate = typeof today === "string" ? today : appToday(today);
  const [transactions, snapshots] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("transactions")
        .select("date,amount,pending")
        .eq("account_id", accountId)
        .order("date")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("balance_snapshots")
        .select("date,balance,source")
        .eq("account_id", accountId)
        .order("date")
        .range(from, to),
    ),
  ]);
  const anchors = snapshots
    .filter(
      (snapshot) =>
        snapshot.date < todayDate &&
        (snapshot.source === "manual" ||
          snapshot.source === "recorded" ||
          (snapshot.source === "observed" && !account.is_manual)),
    )
    .map((snapshot) => ({
      date: snapshot.date,
      balance: Number(snapshot.balance),
    }));
  const rows = reconstructBalances(
    Number(account.current_balance),
    transactions.map((transaction) => ({
      date: transaction.date,
      amount: Number(transaction.amount),
      pending: transaction.pending,
    })),
    todayDate,
    anchors,
  )
    .map((snapshot) => ({
      account_id: accountId,
      date: snapshot.date,
      balance: snapshot.balance,
      source: "reconstructed",
    }));
  const { error: deleteError } = await supabase
    .from("balance_snapshots")
    .delete()
    .eq("account_id", accountId)
    .eq("source", "reconstructed")
    .lt("date", todayDate);
  if (deleteError) throw new Error(deleteError.message);
  if (rows.length) {
    const { error } = await supabase
      .from("balance_snapshots")
      .upsert(rows, { onConflict: "account_id,date" });
    if (error) throw new Error(error.message);
  }
  return { eligible: true, reconstructed: rows.length };
}
