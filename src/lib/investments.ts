import type { ProviderTransaction } from "./integrations/types";
import type { Holding } from "./types";
import { appToday, shiftDate } from "./dates";

export function mapPlaidInvestmentType(
  type?: string | null,
  subtype?: string | null,
  plaidAmount = 0,
  name?: string | null,
): string {
  const normalizedType = type?.trim().toLowerCase() ?? "";
  const normalizedSubtype = subtype?.trim().toLowerCase() ?? "";
  const labels = new Set([normalizedType, normalizedSubtype]);

  if (["contribution", "deposit"].some((label) => labels.has(label))) return "deposit";
  if (["withdrawal", "distribution"].some((label) => labels.has(label))) return "withdrawal";
  if (labels.has("buy")) return "buy";
  if (labels.has("sell")) return "sell";
  if (normalizedSubtype.includes("dividend") || normalizedType === "dividend") {
    return "dividend";
  }
  if (normalizedSubtype.includes("interest") || normalizedType === "interest") {
    return "interest";
  }
  if (normalizedType.includes("fee") || normalizedSubtype.includes("fee")) return "fee";
  if (
    normalizedType === "cash" &&
    plaidAmount < 0 &&
    /funds transfer received|\beft\b|\bach\b|deposit/i.test(name ?? "")
  ) {
    return "transfer_in";
  }
  if (
    normalizedType === "cash" &&
    plaidAmount > 0 &&
    /funds transfer|\beft\b|\bach\b|withdraw/i.test(name ?? "")
  ) {
    return "transfer_out";
  }
  if (/contribut/i.test(name ?? "") && plaidAmount < 0) return "deposit";
  if (labels.has("transfer")) {
    return plaidAmount > 0 ? "transfer_out" : plaidAmount < 0 ? "transfer_in" : "other";
  }
  return "other";
}

export function convertPlaidInvestmentTransaction(transaction: {
  investment_transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  amount: number;
  type?: string | null;
  subtype?: string | null;
}): ProviderTransaction {
  return {
    providerTxnId: `inv:${transaction.investment_transaction_id}`,
    providerAccountId: transaction.account_id,
    date: transaction.date,
    name: transaction.name,
    amount: -transaction.amount,
    suggestedType: mapPlaidInvestmentType(
      transaction.type,
      transaction.subtype,
      transaction.amount,
      transaction.name,
    ),
    pending: false,
  };
}

export function mapPlaidHoldingAssetType(type?: string | null): Holding["assetType"] {
  switch (type?.trim().toLowerCase()) {
    case "equity":
      return "stock";
    case "etf":
      return "etf";
    case "mutual fund":
      return "mutual_fund";
    case "fixed income":
      return "bond";
    case "cash":
      return "cash";
    case "cryptocurrency":
      return "crypto";
    default:
      return "other";
  }
}

export function isRecentIncomeDate(date: string, today: Date): boolean {
  const todayDate = appToday(today);
  return date >= shiftDate(todayDate, -7) && date <= todayDate;
}

export function investmentNoticeForError(error: unknown): string | null {
  const response = error as {
    response?: {
      data?: {
        error_code?: string | null;
        error_message?: string | null;
        display_message?: string | null;
      };
    };
    message?: string;
  };
  const code = response.response?.data?.error_code?.toUpperCase() ?? "";
  const message = [
    response.response?.data?.error_message,
    response.response?.data?.display_message,
    response.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (code === "PRODUCT_NOT_READY") {
    return "Investment data still preparing — sync again in a few minutes";
  }
  if (code === "PRODUCT_NOT_ENABLED" || message.includes("not enabled")) {
    return "Investments product isn't enabled on your Plaid plan";
  }
  if (
    [
      "PRODUCTS_NOT_SUPPORTED",
      "PRODUCT_NOT_SUPPORTED",
      "NO_INVESTMENT_ACCOUNTS",
      "ADDITIONAL_CONSENT_REQUIRED",
      "INVALID_PRODUCT",
    ].includes(code)
  ) {
    return "Investment data not enabled for this connection — click Grant investment access";
  }
  return null;
}
