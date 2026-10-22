import type { SupabaseClient } from "@supabase/supabase-js";

export interface HistoryTransaction {
  date: string;
  amount: number;
  pending: boolean;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function reconstructBalances(
  currentBalance: number,
  transactions: HistoryTransaction[],
  today: Date,
): { date: string; balance: number }[] {
  const todayDate = today.toISOString().slice(0, 10);
  const yesterday = shiftDate(todayDate, -1);
  const eligible = transactions.filter(
    (transaction) => !transaction.pending && transaction.date <= todayDate,
  );
  if (!eligible.length) return [];
  const earliest = eligible.reduce(
    (date, transaction) => (transaction.date < date ? transaction.date : date),
    eligible[0].date,
  );
  const start = earliest > shiftDate(yesterday, -729)
    ? earliest
    : shiftDate(yesterday, -729);
  const byDate = new Map<string, number>();
  for (const transaction of eligible) {
    byDate.set(
      transaction.date,
      (byDate.get(transaction.date) ?? 0) + transaction.amount,
    );
  }

  let balance = currentBalance;
  let date = todayDate;
  const reconstructed: { date: string; balance: number }[] = [];
  while (date > start) {
    balance -= byDate.get(date) ?? 0;
    date = shiftDate(date, -1);
    if (date <= yesterday && date >= start) reconstructed.push({ date, balance });
  }
  return reconstructed.reverse();
}

export async function rebuildAccountHistory(
  supabase: SupabaseClient,
  accountId: string,
  today = new Date(),
): Promise<{ eligible: boolean; reconstructed: number } | null> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,asset_class,current_balance")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account) return null;
  if (account.asset_class !== "cash" && account.asset_class !== "liability") {
    return { eligible: false, reconstructed: 0 };
  }

  const { error: deleteError } = await supabase
    .from("balance_snapshots")
    .delete()
    .eq("account_id", accountId)
    .eq("source", "reconstructed");
  if (deleteError) throw new Error(deleteError.message);

  const [transactions, recorded] = await Promise.all([
    supabase
      .from("transactions")
      .select("date,amount,pending")
      .eq("account_id", accountId)
      .order("date"),
    supabase
      .from("balance_snapshots")
      .select("date")
      .eq("account_id", accountId)
      .eq("source", "recorded"),
  ]);
  if (transactions.error) throw new Error(transactions.error.message);
  if (recorded.error) throw new Error(recorded.error.message);
  const recordedDates = new Set((recorded.data ?? []).map((snapshot) => snapshot.date));
  const rows = reconstructBalances(
    Number(account.current_balance),
    (transactions.data ?? []).map((transaction) => ({
      date: transaction.date,
      amount: Number(transaction.amount),
      pending: transaction.pending,
    })),
    today,
  )
    .filter((snapshot) => !recordedDates.has(snapshot.date))
    .map((snapshot) => ({
      account_id: accountId,
      date: snapshot.date,
      balance: snapshot.balance,
      source: "reconstructed",
    }));
  if (rows.length) {
    const { error } = await supabase
      .from("balance_snapshots")
      .upsert(rows, { onConflict: "account_id,date", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { eligible: true, reconstructed: rows.length };
}
