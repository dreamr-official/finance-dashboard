export type Role = "admin" | "viewer";

export type AccountType =
  | "checking"
  | "savings"
  | "brokerage"
  | "roth_ira"
  | "traditional_ira"
  | "401k"
  | "credit_card"
  | "loan"
  | "cash"
  | "other";

export type AssetClass = "cash" | "investment" | "retirement" | "liability" | "other";

export interface Institution {
  id: string;
  name: string;
  provider: "plaid" | "manual";
  logoUrl?: string;
}

export interface Account {
  id: string;
  institutionId: string;
  name: string;
  type: AccountType;
  assetClass: AssetClass;
  mask?: string;
  currency: string;
  currentBalance: number; // positive = asset; liabilities stored negative
  lastSyncedAt: string | null;
  isManual: boolean;
  connectionStatus: "healthy" | "needs_reauth" | "error" | "manual";
  connectionNotice?: string | null;
}

export interface BalanceSnapshot {
  accountId: string;
  date: string; // ISO date
  balance: number;
}

export type TransactionType =
  | "deposit" // external money in (contribution)
  | "withdrawal" // money out to external
  | "transfer_in"
  | "transfer_out"
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "fee"
  | "expense"
  | "income"
  | "other";

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  name: string;
  amount: number; // signed: + into account, - out
  type: TransactionType;
  /** linked transaction on the other side of a transfer */
  transferPairId?: string;
  /** user/admin overrides */
  typeOverridden?: boolean;
  pending?: boolean;
  category?: string;
  taxYear?: number;
}

export interface Holding {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis?: number;
  assetType: "stock" | "etf" | "mutual_fund" | "cash" | "bond" | "crypto" | "other";
}

export type BillingFrequency = "weekly" | "monthly" | "quarterly" | "annual";

export interface Subscription {
  id: string;
  name: string;
  logoUrl?: string;
  amount: number;
  frequency: BillingFrequency;
  nextExpectedDate: string; // predicted or verified
  dateVerified: boolean;
  accountId?: string;
  status: "active" | "canceled" | "uncertain";
  detected: boolean; // auto-detected from transactions vs manual
  remindDaysBefore?: number;
}

export interface NetWorthSummary {
  netWorth: number;
  assets: number;
  liabilities: number;
  cash: number;
  investments: number;
  change: {
    day: number | null;
    week: number | null;
    month: number | null;
    year: number | null;
  };
}
