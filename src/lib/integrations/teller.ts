import type { FinanceProvider, LinkResult, ProviderAccount, ProviderTransaction, SyncResult } from "./types";
import { isTellerConfigured } from "../env";

const API = "https://api.teller.io";

/**
 * Teller (https://teller.io) — depository accounts (banks, credit unions).
 * Their development environment is free with real data (100 enrollments),
 * ideal for this app. Brokerages go through SnapTrade instead.
 *
 * Auth: Teller Connect on the client returns an `accessToken`; API calls
 * then use HTTP Basic with the token as username. Production additionally
 * requires a client TLS cert (TELLER_CERT/TELLER_KEY) — documented in
 * docs/SETUP.md, never committed.
 */
async function tellerFetch(path: string, accessToken: string) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Teller ${path} → ${res.status}`);
  return res.json();
}

const TYPE_MAP: Record<string, string> = {
  checking: "checking",
  savings: "savings",
  money_market: "savings",
  credit_card: "credit_card",
};

export const tellerProvider: FinanceProvider = {
  id: "teller" as FinanceProvider["id"],
  configured: isTellerConfigured(),

  async createLink(): Promise<LinkResult> {
    if (!this.configured) throw new Error("Teller is not configured");
    // Teller Connect runs client-side with the applicationId; nothing to
    // mint server-side. The client posts the resulting accessToken to
    // /api/integrations/teller/enroll.
    return { linkToken: process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID };
  },

  async completeLink(payload) {
    // payload.access_token + payload.enrollment_id from Teller Connect.
    // Caller (enroll route) encrypts + stores them on a connections row.
    return { connectionId: payload.enrollment_id };
  },

  async sync(accessToken): Promise<SyncResult> {
    if (!this.configured) throw new Error("Teller is not configured");
    // accessToken doubles as the connection handle here; the sync worker
    // passes the decrypted token from connections.encrypted_token.
    const accounts = (await tellerFetch("/accounts", accessToken)) as {
      id: string;
      name: string;
      type: string;
      last_four?: string;
      currency: string;
      links: { balances?: string; transactions?: string };
    }[];

    const out: SyncResult = { accounts: [], transactions: [], holdings: [] };
    for (const a of accounts) {
      let balance = 0;
      try {
        const b = await tellerFetch(`/accounts/${a.id}/balances`, accessToken);
        balance = Number(b.available ?? b.ledger ?? 0);
      } catch {
        /* balance may be unavailable; keep 0 and record error upstream */
      }
      const pa: ProviderAccount = {
        providerAccountId: a.id,
        name: a.name,
        type: TYPE_MAP[a.type] ?? "other",
        mask: a.last_four,
        balance,
        currency: a.currency ?? "USD",
      };
      out.accounts.push(pa);

      try {
        const txns = (await tellerFetch(
          `/accounts/${a.id}/transactions?count=100`,
          accessToken,
        )) as {
          id: string;
          date: string;
          description: string;
          amount: string;
          status: string;
        }[];
        out.transactions.push(
          ...txns.map(
            (t): ProviderTransaction => ({
              providerTxnId: t.id,
              providerAccountId: a.id,
              date: t.date,
              name: t.description,
              amount: Number(t.amount),
              suggestedType: Number(t.amount) > 0 ? "income" : "expense",
              pending: t.status === "pending",
            }),
          ),
        );
      } catch {
        /* transactions endpoint may be unsupported for some institutions */
      }
    }
    return out;
  },

  async requestReauth() {
    // Re-open Teller Connect for the enrollment.
  },
};
