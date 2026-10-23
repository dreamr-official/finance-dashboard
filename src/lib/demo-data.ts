import {
  Account,
  BalanceSnapshot,
  Holding,
  Institution,
  Subscription,
  Transaction,
  TransactionType,
} from "./types";

const DAY = 86400000;
const today = new Date();
const d = (daysAgo: number) => new Date(today.getTime() - daysAgo * DAY).toISOString().slice(0, 10);

// deterministic pseudo-random walk
function walk(seed: number, i: number) {
  const x = Math.sin(seed * 999 + i * 0.37) + Math.sin(seed * 77 + i * 0.11) * 0.5;
  return x;
}

export const demoInstitutions: Institution[] = [
  { id: "inst-bofa", name: "Bank of America", provider: "manual" },
  { id: "inst-stanford", name: "Stanford Federal Credit Union", provider: "manual" },
  { id: "inst-fidelity", name: "Fidelity", provider: "manual" },
  { id: "inst-robinhood", name: "Robinhood", provider: "manual" },
  { id: "inst-happen", name: "Happen Bank", provider: "manual" },
  { id: "inst-xmoney", name: "X Money", provider: "manual" },
];

function acct(
  id: string,
  institutionId: string,
  name: string,
  type: Account["type"],
  assetClass: Account["assetClass"],
  balance: number,
  opts: Partial<Account> = {},
): Account {
  const isManual = opts.isManual ?? true;
  return {
    id,
    institutionId,
    name,
    type,
    assetClass,
    currency: "USD",
    currentBalance: balance,
    lastSyncedAt:
      opts.lastSyncedAt ??
      (isManual ? null : new Date(today.getTime() - 35 * 60e3).toISOString()),
    isManual,
    connectionStatus: opts.connectionStatus ?? (isManual ? "manual" : "healthy"),
    mask: opts.mask,
  };
}

export const demoAccounts: Account[] = [
  acct("a-bofa-chk", "inst-bofa", "BofA Checking", "checking", "cash", 6240.18, { mask: "4412" }),
  acct("a-bofa-sav", "inst-bofa", "BofA Savings", "savings", "cash", 12050.0, { mask: "8841" }),
  acct("a-stan-chk", "inst-stanford", "Stanford FCU Checking", "checking", "cash", 3120.44, {
    mask: "1029",
    isManual: true,
  }),
  acct("a-fid-brok", "inst-fidelity", "Fidelity Brokerage", "brokerage", "investment", 23541.9),
  acct("a-fid-roth", "inst-fidelity", "Fidelity Roth IRA", "roth_ira", "retirement", 18233.15),
  acct("a-fid-401k", "inst-fidelity", "Fidelity 401(k)", "401k", "retirement", 41208.77),
  acct("a-rh-brok", "inst-robinhood", "Robinhood Brokerage", "brokerage", "investment", 9874.52),
  acct("a-rh-roth", "inst-robinhood", "Robinhood Roth IRA", "roth_ira", "retirement", 6110.23),
  acct("a-happen", "inst-happen", "Happen High-Yield Savings", "savings", "cash", 25890.0, {
    isManual: true,
  }),
  acct("a-xmoney", "inst-xmoney", "X Money", "savings", "cash", 4410.77, {
    isManual: true,
    connectionStatus: "manual",
  }),
];

// ~18 months of daily balance snapshots ending at current balance
export const demoSnapshots: BalanceSnapshot[] = demoAccounts.flatMap((a, ai) => {
  const snaps: BalanceSnapshot[] = [];
  const start = a.currentBalance * (0.55 + (ai % 3) * 0.08);
  for (let i = 545; i >= 0; i -= 1) {
    const t = 1 - i / 545;
    const trend = start + (a.currentBalance - start) * t;
    const noise = a.assetClass === "cash" ? Math.sin(i / 9 + ai) * 400 : trend * 0.015 * walk(ai + 1, i);
    snaps.push({ accountId: a.id, date: d(i), balance: Math.max(0, trend + noise) });
  }
  return snaps;
});

let txnSeq = 0;
function txn(
  accountId: string,
  daysAgo: number,
  name: string,
  amount: number,
  type: TransactionType,
  opts: Partial<Transaction> = {},
): Transaction {
  return { id: `t-${txnSeq++}`, accountId, date: d(daysAgo), name, amount, type, ...opts };
}

function transferPair(
  fromId: string,
  toId: string,
  daysAgo: number,
  amount: number,
  name: string,
): Transaction[] {
  const pairId = `pair-${txnSeq}`;
  return [
    txn(fromId, daysAgo, `Transfer to ${name}`, -amount, "transfer_out", {
      transferPairId: pairId,
    }),
    txn(toId, daysAgo, `Transfer from ${name}`, amount, "transfer_in", {
      transferPairId: pairId,
    }),
  ];
}

export const demoTransactions: Transaction[] = [
  // income / spending on BoA checking
  txn("a-bofa-chk", 2, "Payroll — Acme Corp", 3850.0, "income"),
  txn("a-bofa-chk", 4, "Whole Foods", -142.33, "expense", { category: "Groceries" }),
  txn("a-bofa-chk", 6, "PG&E Utilities", -96.2, "expense", { category: "Utilities" }),
  txn("a-bofa-chk", 9, "Rent", -2400.0, "expense", { category: "Housing" }),
  txn("a-bofa-chk", 16, "Payroll — Acme Corp", 3850.0, "income"),
  txn("a-bofa-chk", 19, "Costco", -231.1, "expense", { category: "Groceries" }),
  txn("a-bofa-chk", 27, "PG&E Utilities", -88.14, "expense", { category: "Utilities" }),
  txn("a-bofa-chk", 30, "Payroll — Acme Corp", 3850.0, "income"),
  // recurring subscriptions on checking
  txn("a-bofa-chk", 3, "Netflix", -15.49, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 11, "Spotify", -11.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 14, "iCloud+", -2.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 21, "YouTube Premium", -13.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 33, "Netflix", -15.49, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 41, "Spotify", -11.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 44, "iCloud+", -2.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 51, "YouTube Premium", -13.99, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 63, "Netflix", -15.49, "expense", { category: "Subscriptions" }),
  txn("a-bofa-chk", 71, "Spotify", -11.99, "expense", { category: "Subscriptions" }),
  txn("a-stan-chk", 8, "Planet Fitness", -24.99, "expense", { category: "Subscriptions" }),
  txn("a-stan-chk", 38, "Planet Fitness", -24.99, "expense", { category: "Subscriptions" }),
  txn("a-stan-chk", 68, "Planet Fitness", -24.99, "expense", { category: "Subscriptions" }),
  txn("a-stan-chk", 90, "Amazon Prime (annual)", -139.0, "expense", { category: "Subscriptions" }),
  // interest on savings
  txn("a-happen", 12, "Interest", 92.14, "interest"),
  txn("a-happen", 42, "Interest", 89.02, "interest"),
  txn("a-happen", 72, "Interest", 85.4, "interest"),
  txn("a-bofa-sav", 15, "Interest", 3.11, "interest"),
  txn("a-xmoney", 18, "Interest", 12.88, "interest"),
  // transfers between own accounts (NOT contributions)
  ...transferPair("a-bofa-chk", "a-happen", 10, 2000, "Happen HYSA"),
  ...transferPair("a-bofa-chk", "a-bofa-sav", 24, 1500, "BofA Savings"),
  ...transferPair("a-bofa-chk", "a-xmoney", 40, 1000, "X Money"),
  // external deposits into investment accounts (contributions)
  txn("a-fid-brok", 28, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 58, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 88, "ACH Deposit — Fidelity", 2500.0, "deposit"),
  txn("a-fid-brok", 120, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 150, "ACH Deposit — Fidelity", 2500.0, "deposit"),
  txn("a-fid-brok", 200, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 260, "ACH Deposit — Fidelity", 3000.0, "deposit"),
  txn("a-fid-brok", 340, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 400, "ACH Deposit — Fidelity", 2000.0, "deposit"),
  txn("a-fid-brok", 500, "Opening deposit", 2000.0, "deposit"),
  txn("a-fid-brok", 60, "Buy VTI 9.1 sh", -2000.0, "buy"),
  txn("a-fid-brok", 90, "Buy VOO 5.0 sh", -2500.0, "buy"),
  txn("a-fid-brok", 24, "Dividend VTI", 41.2, "dividend"),
  txn("a-fid-brok", 55, "Dividend VOO", 58.9, "dividend"),
  txn("a-rh-brok", 35, "Deposit — Robinhood", 1500.0, "deposit"),
  txn("a-rh-brok", 95, "Deposit — Robinhood", 1500.0, "deposit"),
  txn("a-rh-brok", 160, "Deposit — Robinhood", 1000.0, "deposit"),
  txn("a-rh-brok", 230, "Deposit — Robinhood", 1500.0, "deposit"),
  txn("a-rh-brok", 300, "Deposit — Robinhood", 1000.0, "deposit"),
  txn("a-rh-brok", 45, "Buy NVDA 3 sh", -1320.0, "buy"),
  txn("a-rh-brok", 100, "Buy AAPL 6 sh", -1140.0, "buy"),
  txn("a-rh-brok", 210, "Sell TSLA 2 sh", 480.0, "sell"),
  // Roth contributions (current + prior tax year)
  txn("a-fid-roth", 20, "Roth contribution 2026", 1000.0, "deposit"),
  txn("a-fid-roth", 50, "Roth contribution 2026", 1000.0, "deposit"),
  txn("a-fid-roth", 80, "Roth contribution 2025", 1500.0, "deposit"),
  txn("a-fid-roth", 110, "Roth contribution 2025", 1500.0, "deposit"),
  txn("a-fid-roth", 320, "Roth contribution 2025", 2000.0, "deposit"),
  txn("a-fid-roth", 350, "Roth contribution 2025", 2000.0, "deposit"),
  txn("a-rh-roth", 60, "Roth contribution 2026", 500.0, "deposit"),
  txn("a-rh-roth", 130, "Roth contribution 2025", 1000.0, "deposit"),
  // 401k payroll contributions
  ...[10, 24, 38, 52, 66, 80, 94, 108, 122, 136, 150, 164].flatMap((n) => [
    txn("a-fid-401k", n, "401(k) payroll contribution", 1150.0, "deposit"),
    txn("a-fid-401k", n, "Employer match", 575.0, "deposit"),
  ]),
  // transfers between investment accounts (rollover, correctly excluded)
  ...transferPair("a-fid-brok", "a-fid-roth", 140, 1000, "Fidelity Roth IRA"),
  // checking outflows that funded the deposits above (unlinked; matched by the Transfers page)
  ...(
    [
      [28, 2000, "Fidelity"], [58, 2000, "Fidelity"], [120, 2000, "Fidelity"],
      [150, 2500, "Fidelity"], [200, 2000, "Fidelity"], [260, 3000, "Fidelity"],
      [340, 2000, "Fidelity"], [35, 1500, "Robinhood"], [95, 1500, "Robinhood"],
      [160, 1000, "Robinhood"], [230, 1500, "Robinhood"], [300, 1000, "Robinhood"],
      [20, 1000, "Fidelity"], [50, 1000, "Fidelity"], [80, 1500, "Fidelity"],
      [110, 1500, "Fidelity"], [320, 2000, "Fidelity"], [350, 2000, "Fidelity"],
      [60, 500, "Robinhood"], [130, 1000, "Robinhood"],
    ] as const
  ).map(([daysAgo, amount, to]) =>
    txn("a-bofa-chk", daysAgo + 1, `Online Banking transfer to ${to}`, -amount, "transfer_out"),
  ),
  txn("a-bofa-chk", 46, "Online Banking transfer to Schwab", -750.0, "transfer_out"),
  txn("a-bofa-chk", 1, "Transfer to Happen HYSA", -500.0, "transfer_out", { pending: true }),
];

export const demoHoldings: Holding[] = [
  { id: "h1", accountId: "a-fid-brok", symbol: "VTI", name: "Vanguard Total Stock", quantity: 42.1, price: 292.4, value: 12310.0, costBasis: 11200.0, assetType: "etf" },
  { id: "h2", accountId: "a-fid-brok", symbol: "VOO", name: "Vanguard S&P 500", quantity: 18.2, price: 545.1, value: 9921.0, costBasis: 9100.0, assetType: "etf" },
  { id: "h3", accountId: "a-fid-brok", symbol: "SPAXX", name: "Fidelity Cash", quantity: 1, price: 1, value: 1310.9, assetType: "cash" },
  { id: "h4", accountId: "a-fid-roth", symbol: "FXAIX", name: "Fidelity 500 Index", quantity: 88.4, price: 206.2, value: 18233.15, costBasis: 16000.0, assetType: "mutual_fund" },
  { id: "h5", accountId: "a-fid-401k", symbol: "FXAIX", name: "Fidelity 500 Index", quantity: 160.2, price: 206.2, value: 33033.24, assetType: "mutual_fund" },
  { id: "h6", accountId: "a-fid-401k", symbol: "FXNAX", name: "Fidelity Bond Index", quantity: 720, price: 11.33, value: 8175.53, assetType: "mutual_fund" },
  { id: "h7", accountId: "a-rh-brok", symbol: "NVDA", name: "NVIDIA", quantity: 12, price: 186.4, value: 2236.8, costBasis: 1320.0, assetType: "stock" },
  { id: "h8", accountId: "a-rh-brok", symbol: "AAPL", name: "Apple", quantity: 22, price: 252.3, value: 5550.6, costBasis: 4180.0, assetType: "stock" },
  { id: "h9", accountId: "a-rh-brok", symbol: "VOO", name: "Vanguard S&P 500", quantity: 2.5, price: 545.1, value: 1362.75, assetType: "etf" },
  { id: "h10", accountId: "a-rh-brok", symbol: "CASH", name: "Cash", quantity: 1, price: 1, value: 724.37, assetType: "cash" },
  { id: "h11", accountId: "a-rh-roth", symbol: "VTI", name: "Vanguard Total Stock", quantity: 20.9, price: 292.4, value: 6110.23, costBasis: 5500.0, assetType: "etf" },
];

export const demoSubscriptions: Subscription[] = [
  { id: "s1", name: "Netflix", amount: 15.49, frequency: "monthly", nextExpectedDate: d(-28), dateVerified: false, accountId: "a-bofa-chk", status: "active", detected: true },
  { id: "s2", name: "Spotify", amount: 11.99, frequency: "monthly", nextExpectedDate: d(-19), dateVerified: false, accountId: "a-bofa-chk", status: "active", detected: true },
  { id: "s3", name: "iCloud+", amount: 2.99, frequency: "monthly", nextExpectedDate: d(-16), dateVerified: true, accountId: "a-bofa-chk", status: "active", detected: true },
  { id: "s4", name: "YouTube Premium", amount: 13.99, frequency: "monthly", nextExpectedDate: d(-9), dateVerified: false, accountId: "a-bofa-chk", status: "active", detected: true },
  { id: "s5", name: "Planet Fitness", amount: 24.99, frequency: "monthly", nextExpectedDate: d(-22), dateVerified: false, accountId: "a-stan-chk", status: "active", detected: true },
  { id: "s6", name: "Amazon Prime", amount: 139.0, frequency: "annual", nextExpectedDate: d(-275), dateVerified: true, accountId: "a-stan-chk", status: "active", detected: true },
  { id: "s7", name: "GitHub Copilot", amount: 10.0, frequency: "monthly", nextExpectedDate: d(-6), dateVerified: false, status: "active", detected: false },
  { id: "s8", name: "NYT Cooking", amount: 5.0, frequency: "monthly", nextExpectedDate: d(-40), dateVerified: false, status: "canceled", detected: false },
];

export const demoDataset = {
  institutions: demoInstitutions,
  accounts: demoAccounts,
  snapshots: demoSnapshots,
  transactions: demoTransactions,
  holdings: demoHoldings,
  subscriptions: demoSubscriptions,
};
