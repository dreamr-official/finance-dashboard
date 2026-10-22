import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import type { FinanceProvider, LinkResult, SyncResult } from "./types";
import { isPlaidConfigured } from "../env";

export function plaidClient() {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
          "PLAID-SECRET": process.env.PLAID_SECRET!,
        },
      },
    }),
  );
}

/** Plaid account type/subtype → our account_type. */
export function plaidAccountType(type?: string, subtype?: string): string {
  if (type === "depository") return subtype === "savings" ? "savings" : "checking";
  if (type === "credit") return "credit_card";
  if (type === "loan") return "loan";
  if (type === "investment") {
    const normalizedSubtype = subtype?.toLowerCase().replace(/[\s-]+/g, "_");
    if (normalizedSubtype === "roth" || normalizedSubtype === "roth_ira") {
      return "roth_ira";
    }
    if (normalizedSubtype === "ira" || normalizedSubtype === "traditional_ira") {
      return "traditional_ira";
    }
    if (normalizedSubtype === "401k") return "401k";
    return "brokerage";
  }
  return "other";
}

export function convertPlaidTransaction(t: {
  transaction_id: string;
  account_id: string;
  date: string;
  merchant_name?: string | null;
  name: string;
  amount: number;
  personal_finance_category?: { primary?: string | null } | null;
  pending?: boolean;
}) {
  const category = t.personal_finance_category?.primary;
  const suggestedType =
    category === "TRANSFER_IN"
      ? "transfer_in"
      : category === "TRANSFER_OUT"
        ? "transfer_out"
        : undefined;
  return {
    providerTxnId: t.transaction_id,
    providerAccountId: t.account_id,
    date: t.date,
    name: t.merchant_name ?? t.name,
    amount: -t.amount,
    ...(suggestedType ? { suggestedType } : {}),
    category: category ?? undefined,
    pending: t.pending,
  };
}

export const plaidProvider: FinanceProvider = {
  id: "plaid",
  configured: isPlaidConfigured(),

  async createLink(userId): Promise<LinkResult> {
    if (!this.configured) throw new Error("Plaid is not configured");
    const res = await plaidClient().linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Personal Finance Dashboard",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return { linkToken: res.data.link_token, expiresAt: res.data.expiration };
  },

  /** Exchange the public token and return the raw access token — the API
   *  route encrypts/stores it; the provider itself never persists state. */
  async completeLink(payload) {
    if (!this.configured) throw new Error("Plaid is not configured");
    const res = await plaidClient().itemPublicTokenExchange({
      public_token: payload.public_token,
    });
    return {
      itemId: res.data.item_id,
      accessToken: res.data.access_token,
    };
  },

  /** Pull accounts + transactions via /transactions/sync (incremental).
   *  The sync pipeline decrypts the access token before calling. Amounts are
   *  converted to our convention (+ into the account, - out). */
  async sync(accessToken, cursor): Promise<SyncResult> {
    if (!this.configured) throw new Error("Plaid is not configured");
    const client = plaidClient();
    const accountResponse = await client.accountsGet({ access_token: accessToken });
    const accounts = accountResponse.data.accounts.map((a) => {
      const type = plaidAccountType(a.type, a.subtype ?? undefined);
      const current = a.balances.current ?? 0;
      const balance =
        type === "credit_card" || type === "loan" ? -Math.abs(current) : current;
      return {
        providerAccountId: a.account_id,
        name: a.official_name ?? a.name,
        type,
        mask: a.mask ?? undefined,
        balance,
        currency: a.balances.iso_currency_code ?? "USD",
      };
    });

    const syncTransactions = async (startCursor?: string) => {
      const transactions: SyncResult["transactions"] = [];
      const removedTxnIds: string[] = [];
      let nextCursor = startCursor;
      let hasMore = true;
      while (hasMore) {
        const response = await client.transactionsSync({
          access_token: accessToken,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        const d = response.data;
        transactions.push(...[...d.added, ...d.modified].map(convertPlaidTransaction));
        removedTxnIds.push(...d.removed.map((t) => t.transaction_id));
        hasMore = d.has_more;
        nextCursor = d.next_cursor;
      }
      return { transactions, removedTxnIds, cursor: nextCursor };
    };

    let synced;
    try {
      synced = await syncTransactions(cursor);
    } catch (error) {
      const plaidError = error as { response?: { data?: { error_code?: string } } };
      if (
        plaidError.response?.data?.error_code !==
        "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
      ) {
        throw error;
      }
      synced = await syncTransactions(cursor);
    }

    return {
      accounts,
      transactions: synced.transactions,
      removedTxnIds: synced.removedTxnIds,
      holdings: [],
      cursor: synced.cursor,
    };
  },

  async requestReauth() {
    // Client re-opens Plaid Link in update mode with a fresh link token.
  },
};
