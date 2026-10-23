import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { rebuildAccountHistory } from "@/lib/backfill";
import { buildTransferLegs } from "@/lib/transfers";
import { randomUUID } from "crypto";
import { z } from "zod";
import { appToday, shiftDate } from "@/lib/dates";
import { isoDate } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api-error";

const schema = z
  .object({
    from_account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    amount: z.number().positive(),
    date: isoDate,
    note: z.string().max(200).optional(),
  })
  .refine((data) => data.from_account_id !== data.to_account_id, {
    path: ["to_account_id"],
    message: "Choose a different destination account.",
  });

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  if (isDemoMode()) {
    return Response.json({ error: "Mutations require Supabase" }, { status: 501 });
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.issues }, { status: 400 });
  }
  const today = appToday();
  if (body.data.date > shiftDate(today, 7)) {
    return Response.json(
      { error: "Transfer date cannot be more than 7 days in the future." },
      { status: 400 },
    );
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const accountIds = [body.data.from_account_id, body.data.to_account_id];
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id,current_balance,is_manual")
    .in("id", accountIds);
  if (accountsError) return apiErrorResponse(accountsError);
  if (accounts?.length !== 2) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }
  if (accounts.every((account) => !account.is_manual)) {
    return Response.json({ error: "Transfers need at least one manual account" }, { status: 409 });
  }

  const pairId = randomUUID();
  const allLegs = buildTransferLegs(
    {
      fromAccountId: body.data.from_account_id,
      toAccountId: body.data.to_account_id,
      amount: body.data.amount,
      date: body.data.date,
      note: body.data.note,
    },
    pairId,
  );
  const manualIds = new Set(accounts.filter((account) => account.is_manual).map((account) => account.id));
  const legs = allLegs.filter((leg) => manualIds.has(leg.account_id));
  const { data: transactions, error: transactionError } = await supabase
    .from("transactions")
    .insert(legs)
    .select();
  if (transactionError) {
    return apiErrorResponse(transactionError);
  }

  for (const account of accounts) {
    if (!account.is_manual) continue;
    const delta = legs
      .filter((leg) => leg.account_id === account.id)
      .reduce((sum, leg) => sum + leg.amount, 0);
    const balance = Number(account.current_balance) + delta;
    const { error: updateError } = await supabase
      .from("accounts")
      .update({ current_balance: balance })
      .eq("id", account.id);
    if (updateError) {
      return apiErrorResponse(updateError);
    }
    const { error: snapshotError } = await supabase
      .from("balance_snapshots")
      .upsert({ account_id: account.id, date: today, balance, source: "manual" });
    if (snapshotError) {
      return apiErrorResponse(snapshotError);
    }
  }
  for (const accountId of accountIds) {
    await rebuildAccountHistory(supabase, accountId);
  }
  return Response.json({ transactions, transfer_pair_id: pairId }, { status: 201 });
}
