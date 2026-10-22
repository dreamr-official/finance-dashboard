import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import type { FinanceProvider, LinkResult, SyncResult } from "./types";
import { isPlaidConfigured } from "../env";

function client() {
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

export const plaidProvider: FinanceProvider = {
  id: "plaid",
  configured: isPlaidConfigured(),

  async createLink(userId): Promise<LinkResult> {
    if (!this.configured) throw new Error("Plaid is not configured");
    const res = await client().linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Personal Finance Dashboard",
      products: [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return { linkToken: res.data.link_token, expiresAt: res.data.expiration };
  },

  async completeLink(payload) {
    if (!this.configured) throw new Error("Plaid is not configured");
    const res = await client().itemPublicTokenExchange({
      public_token: payload.public_token,
    });
    // TODO(sync pipeline): encrypt res.data.access_token with pgsodium and
    // store in connections.encrypted_token alongside res.data.item_id.
    return { connectionId: res.data.item_id };
  },

  async sync(connectionId, cursor): Promise<SyncResult> {
    if (!this.configured) throw new Error("Plaid is not configured");
    // Implemented by the sync worker in Phase 2: decrypt token for
    // connectionId, call /transactions/sync with cursor, /investments/holdings/get,
    // map results, and upsert idempotently by provider_txn_id.
    void connectionId;
    void cursor;
    return { accounts: [], transactions: [], holdings: [] };
  },

  async requestReauth() {
    // Client re-opens Plaid Link in update mode with a new link token.
  },
};
