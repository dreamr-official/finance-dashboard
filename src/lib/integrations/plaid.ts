import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import type { FinanceProvider, LinkResult, SyncResult } from "./types";
import { isPlaidConfigured } from "../env";
import {
  convertPlaidInvestmentTransaction,
  investmentNoticeForError,
  mapPlaidHoldingAssetType,
} from "../investments";

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
      optional_products: [Products.Investments],
      transactions: { days_requested: 730 },
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
  async sync(accessToken, cursor, investmentStartDate): Promise<SyncResult> {
    if (!this.configured) throw new Error("Plaid is not configured");
    const client = plaidClient();
    let accounts: SyncResult["accounts"] = [];
    try {
      const accountResponse = await client.accountsGet({ access_token: accessToken });
      accounts = accountResponse.data.accounts.map((a) => {
        const type = plaidAccountType(a.type, a.subtype ?? undefined);
        const current = a.balances.current ?? 0;
        const balance =
          type === "credit_card" || type === "loan" ? -current : current;
        return {
          providerAccountId: a.account_id,
          name: a.official_name ?? a.name,
          type,
          mask: a.mask ?? undefined,
          balance,
          currency: a.balances.iso_currency_code ?? "USD",
        };
      });
    } catch (error) {
      const code = (error as { response?: { data?: { error_code?: string } } })
        .response?.data?.error_code;
      if (code !== "PRODUCTS_NOT_SUPPORTED" && code !== "NO_ACCOUNTS") throw error;
    }

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
    for (let attempt = 0; ; attempt++) {
      try {
        synced = await syncTransactions(cursor);
        break;
      } catch (error) {
        const code = (error as { response?: { data?: { error_code?: string } } })
          .response?.data?.error_code;
        if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_ACCOUNTS") {
          synced = { transactions: [], removedTxnIds: [], cursor };
          break;
        }
        if (code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt >= 2) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1000));
      }
    }

    const endDate = new Date().toISOString().slice(0, 10);
    const startDate =
      investmentStartDate ??
      (() => {
        const date = new Date();
        date.setUTCMonth(date.getUTCMonth() - 24);
        return date.toISOString().slice(0, 10);
      })();
    const holdings: SyncResult["holdings"] = [];
    const investmentTransactions: SyncResult["transactions"] = [];
    let holdingsSynced = false;
    let notice: string | null = null;
    try {
      const holdingsResponse = await client.investmentsHoldingsGet({
        access_token: accessToken,
      });
      const securityById = new Map(
        holdingsResponse.data.securities.map((security) => [security.security_id, security]),
      );
      holdings.push(
        ...holdingsResponse.data.holdings.map((holding) => {
          const security = securityById.get(holding.security_id);
          return {
            providerAccountId: holding.account_id,
            symbol:
              security?.ticker_symbol ??
              security?.name ??
              holding.security_id,
            name: security?.name ?? security?.ticker_symbol ?? holding.security_id,
            quantity: holding.quantity,
            price: holding.institution_price,
            value: holding.institution_value,
            costBasis: holding.cost_basis ?? undefined,
            assetType: mapPlaidHoldingAssetType(security?.type),
          };
        }),
      );
      holdingsSynced = true;

      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (offset < total) {
        const transactionsResponse = await client.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: { count: 500, offset },
        });
        total = transactionsResponse.data.total_investment_transactions;
        const page = transactionsResponse.data.investment_transactions;
        investmentTransactions.push(...page.map(convertPlaidInvestmentTransaction));
        offset += page.length;
        if (page.length === 0) break;
      }
    } catch (error) {
      notice = investmentNoticeForError(error);
      if (!notice) throw error;
    }

    return {
      accounts,
      transactions: [...synced.transactions, ...investmentTransactions],
      removedTxnIds: synced.removedTxnIds,
      holdings,
      cursor: synced.cursor,
      holdingsSynced,
      notice,
    };
  },

  async requestReauth() {
    // Client re-opens Plaid Link in update mode with a fresh link token.
  },
};

export async function createPlaidUpdateLink(userId: string, accessToken: string) {
  const res = await plaidClient().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Personal Finance Dashboard",
    access_token: accessToken,
    additional_consented_products: [Products.Investments],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return { linkToken: res.data.link_token, expiresAt: res.data.expiration };
}
