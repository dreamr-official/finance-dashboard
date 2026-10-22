/**
 * Provider-agnostic financial integration contract. Each provider
 * (Plaid, SnapTrade, manual CSV) implements this; the sync pipeline and
 * UI only ever talk to this interface so new providers slot in later.
 */

export interface ProviderAccount {
  providerAccountId: string;
  name: string;
  type: string;
  mask?: string;
  balance: number;
  currency: string;
}

export interface ProviderTransaction {
  providerTxnId: string;
  providerAccountId: string;
  date: string;
  name: string;
  amount: number;
  suggestedType: string;
  category?: string;
  pending?: boolean;
}

export interface ProviderHolding {
  providerAccountId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis?: number;
}

export interface LinkResult {
  /** URL or token the frontend uses to open the provider's link flow. */
  linkUrl?: string;
  linkToken?: string;
  expiresAt?: string;
}

export interface SyncResult {
  accounts: ProviderAccount[];
  transactions: ProviderTransaction[];
  holdings: ProviderHolding[];
  cursor?: string; // for incremental sync
}

export interface FinanceProvider {
  readonly id: "plaid" | "snaptrade" | "manual";
  readonly configured: boolean;
  /** Begin a connection flow (e.g. Plaid Link token). */
  createLink(userId: string): Promise<LinkResult>;
  /** Exchange a public token / complete OAuth; returns connection id. */
  completeLink(payload: Record<string, string>): Promise<{ connectionId: string }>;
  /** Pull accounts + transactions + holdings for a connection. */
  sync(connectionId: string, cursor?: string): Promise<SyncResult>;
  /** Mark a broken connection for re-auth. */
  requestReauth(connectionId: string): Promise<void>;
}
