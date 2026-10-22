import type { FinanceProvider, LinkResult, SyncResult } from "./types";
import { isSnapTradeConfigured } from "../env";

/**
 * SnapTrade covers brokerages/retirement accounts Plaid Investments
 * doesn't reach. Registered here so the registry/UI can enumerate it;
 * network calls land in Phase 2 once credentials are configured.
 */
export const snaptradeProvider: FinanceProvider = {
  id: "snaptrade",
  configured: isSnapTradeConfigured(),

  async createLink(userId): Promise<LinkResult> {
    if (!this.configured) throw new Error("SnapTrade is not configured");
    // Phase 2: register user, then POST /login returns the redirect URL.
    void userId;
    throw new Error("SnapTrade link flow not yet implemented — add credentials and finish wiring");
  },

  async completeLink() {
    throw new Error("SnapTrade link flow not yet implemented");
  },

  async sync(): Promise<SyncResult> {
    return { accounts: [], transactions: [], holdings: [] };
  },

  async requestReauth() {},
};
