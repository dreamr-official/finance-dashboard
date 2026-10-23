import { describe, expect, it } from "vitest";
import { summarizeActivity } from "./activity";
import { groupByMonth } from "./transaction-list";
import { demoDataset } from "./demo-data";
import { classifyType, normalizeTransactionAmount } from "./transactions";
import { buildTransferLegs } from "./transfers";
import { convertPlaidTransaction, plaidAccountType } from "./integrations/plaid";
import {
  accountChanges,
  applyNetWorthChange,
  computeNetWorth,
  netWorthSeries,
  rothContributions,
  isWithdrawal,
} from "./finance";
import type { Account, Transaction } from "./types";

function account(
  id: string,
  currentBalance: number,
  assetClass: Account["assetClass"] = "cash",
  type: Account["type"] = "checking",
): Account {
  return {
    id,
    institutionId: "institution",
    name: id,
    type,
    assetClass,
    currency: "USD",
    currentBalance,
    lastSyncedAt: null,
    isManual: true,
    connectionStatus: "manual",
  };
}

function transaction(
  accountId: string,
  date: string,
  amount: number,
  type: Transaction["type"],
): Transaction {
  return {
    id: `${accountId}-${date}-${type}`,
    accountId,
    date,
    name: type,
    amount,
    type,
    typeOverridden: false,
    pending: false,
  };
}

describe("signed net worth", () => {
  it("sums account balances consistently and derives liability display from signed balances", () => {
    const summary = computeNetWorth([
      account("cash", 100),
      account("negative-cash", -20),
      account("investment", 200, "investment", "brokerage"),
      account("overpaid-card", 20, "liability", "credit_card"),
      account("loan", -100, "liability", "loan"),
    ]);

    expect(summary).toMatchObject({
      netWorth: 200,
      assets: 300,
      liabilities: 100,
      cash: 100,
      investments: 200,
    });
  });

  it("carries each account's earliest snapshot back before its first date", () => {
    expect(
      netWorthSeries(
        [
          account("cash", 100),
          account("liability", 20, "liability", "credit_card"),
          account("no-history", 30),
        ],
        [
          { accountId: "cash", date: "2026-01-01", balance: 10 },
          { accountId: "cash", date: "2026-01-05", balance: 50 },
          { accountId: "liability", date: "2026-01-03", balance: -20 },
          { accountId: "liability", date: "2026-01-05", balance: 10 },
        ],
      ),
    ).toEqual([
      { date: "2026-01-01", value: 20 },
      { date: "2026-01-03", value: 20 },
      { date: "2026-01-05", value: 90 },
    ]);
  });

  it("appends today's current balance when snapshots end earlier", () => {
    expect(
      netWorthSeries(
        [account("cash", 120)],
        [{ accountId: "cash", date: "2026-10-20", balance: 100 }],
        "2026-10-23",
      ),
    ).toEqual([
      { date: "2026-10-20", value: 100 },
      { date: "2026-10-23", value: 120 },
    ]);
  });

  it("uses current balances for today when a snapshot already exists", () => {
    expect(netWorthSeries([account("cash", 120)], [], "2026-10-23")).toEqual([
      { date: "2026-10-23", value: 120 },
    ]);
    expect(
      netWorthSeries(
        [account("cash", 120)],
        [{ accountId: "cash", date: "2026-10-23", balance: 100 }],
        "2026-10-23",
      ),
    ).toEqual([{ date: "2026-10-23", value: 120 }]);
  });

  it("uses current net worth as the header delta endpoint", () => {
    const summary = computeNetWorth([account("cash", 120)]);
    expect(
      applyNetWorthChange(summary, [
        { date: "2026-10-20", value: 100 },
        { date: "2026-10-23", value: 110 },
      ]).change,
    ).toEqual({ day: 20, week: null, month: null, year: null });
  });

  it("keeps the latest demo snapshot equal to each account's current balance", () => {
    const { accounts, snapshots } = demoDataset;
    for (const account of accounts) {
      const latest = snapshots
        .filter((snapshot) => snapshot.accountId === account.id)
        .sort((left, right) => right.date.localeCompare(left.date))[0];
      expect(latest.balance).toBe(account.currentBalance);
    }
  });

  it("does not inflate deltas when a new investment has only today's snapshot", () => {
    const accounts = [
      account("checking", 1250),
      account("investment", 50000, "investment", "brokerage"),
    ];
    const series = netWorthSeries(accounts, [
      { accountId: "checking", date: "2025-12-31", balance: 1000 },
      { accountId: "checking", date: "2026-12-30", balance: 1200 },
      { accountId: "checking", date: "2026-12-31", balance: 1250 },
      { accountId: "investment", date: "2026-12-31", balance: 50000 },
    ]);
    const summary = applyNetWorthChange(computeNetWorth(accounts), series);
    expect(summary.change).toEqual({ day: 50, week: 250, month: 250, year: 250 });
  });

  it("returns null when a change window extends beyond available history", () => {
    const summary = computeNetWorth([account("cash", 100)]);
    expect(
      applyNetWorthChange(summary, [
        { date: "2026-10-01", value: 90 },
        { date: "2026-10-23", value: 100 },
      ]).change,
    ).toEqual({ day: 10, week: 10, month: null, year: null });
    expect(applyNetWorthChange(summary, [{ date: "2026-10-23", value: 100 }]).change)
      .toEqual({ day: null, week: null, month: null, year: null });
  });

  it("reports up, down, unchanged, and new accounts in change order", () => {
    const accounts = [
      account("up", 120),
      account("down", 80),
      account("same", 10),
      account("new", 50),
    ];
    const changes = accountChanges(
      accounts,
      [
        { accountId: "up", date: "2026-10-22", balance: 100 },
        { accountId: "down", date: "2026-10-22", balance: 100 },
        { accountId: "same", date: "2026-10-22", balance: 10 },
        { accountId: "new", date: "2026-10-23", balance: 40 },
      ],
      [],
      "2026-10-23",
      1,
    );

    expect(changes.map(({ account: { id }, change, isNew }) => [id, change, isNew])).toEqual([
      ["down", -20, false],
      ["up", 20, false],
      ["same", 0, false],
      ["new", null, true],
    ]);
    expect(changes.find((entry) => entry.account.id === "up")?.pct).toBe(0.2);
  });

  it("keeps liability changes signed and chooses the latest snapshot on or before cutoff", () => {
    const liability = account("card", -700, "liability", "credit_card");
    const [change] = accountChanges(
      [liability],
      [
        { accountId: "card", date: "2026-10-15", balance: -400 },
        { accountId: "card", date: "2026-10-20", balance: -500 },
        { accountId: "card", date: "2026-10-22", balance: -550 },
        { accountId: "card", date: "2026-10-23", balance: -600 },
      ],
      [],
      "2026-10-23",
      1,
    );

    expect(change).toMatchObject({
      start: -550,
      end: -700,
      change: -150,
      pct: -150 / 550,
      isNew: false,
    });
  });

  it("uses null percent change when the start balance is zero", () => {
    const [change] = accountChanges(
      [account("zero-start", 100)],
      [{ accountId: "zero-start", date: "2026-10-22", balance: 0 }],
      [],
      "2026-10-23",
      1,
    );

    expect(change).toMatchObject({ start: 0, change: 100, pct: null, isNew: false });
  });

  it("splits deposit-only changes into money added with no market change", () => {
    const [change] = accountChanges(
      [account("investment", 1250, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [transaction("investment", "2026-10-17", 250, "deposit")],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ change: 250, moneyAdded: 250, marketChange: 0 });
  });

  it("splits pure market movement with no money added", () => {
    const [change] = accountChanges(
      [account("investment", 1100, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ change: 100, moneyAdded: 0, marketChange: 100 });
  });

  it("separates deposits from market movement in the same window", () => {
    const [change] = accountChanges(
      [account("investment", 1250, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [transaction("investment", "2026-10-18", 200, "deposit")],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ change: 250, moneyAdded: 200, marketChange: 50 });
  });

  it("does not count trades, dividends, interest, or fees as money added", () => {
    const [change] = accountChanges(
      [account("investment", 1125, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [
        transaction("investment", "2026-10-17", -600, "buy"),
        transaction("investment", "2026-10-18", 500, "sell"),
        transaction("investment", "2026-10-19", 50, "dividend"),
        transaction("investment", "2026-10-20", 15, "interest"),
        transaction("investment", "2026-10-21", -10, "fee"),
      ],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ moneyAdded: 0, marketChange: 125 });
  });

  it("counts supported boundary flows and rounds their sum to cents", () => {
    const [change] = accountChanges(
      [account("investment", 1065.3, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [
        transaction("investment", "2026-10-17", 100, "deposit"),
        transaction("investment", "2026-10-17", -50, "withdrawal"),
        transaction("investment", "2026-10-18", 30, "transfer_in"),
        transaction("investment", "2026-10-18", -20, "transfer_out"),
        transaction("investment", "2026-10-19", 10, "income"),
        transaction("investment", "2026-10-19", -5, "expense"),
        transaction("investment", "2026-10-20", 0.1, "other"),
        transaction("investment", "2026-10-21", 0.2, "other"),
      ],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ moneyAdded: 65.3, marketChange: 0 });
  });

  it("starts the transaction window at the snapshot actually used, before the cutoff", () => {
    const [change] = accountChanges(
      [account("investment", 1300, "investment", "brokerage")],
      [
        { accountId: "investment", date: "2026-10-14", balance: 1000 },
        { accountId: "investment", date: "2026-10-20", balance: 1200 },
      ],
      [
        transaction("investment", "2026-10-14", 1000, "deposit"),
        transaction("investment", "2026-10-15", 100, "deposit"),
        transaction("investment", "2026-10-22", 50, "deposit"),
        transaction("investment", "2026-10-24", 1000, "deposit"),
      ],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({
      start: 1000,
      moneyAdded: 150,
      marketChange: 150,
    });
  });

  it("excludes pending investment transactions from money added", () => {
    const pendingDeposit = {
      ...transaction("investment", "2026-10-17", 250, "deposit"),
      pending: true,
    };
    const [change] = accountChanges(
      [account("investment", 1100, "investment", "brokerage")],
      [{ accountId: "investment", date: "2026-10-16", balance: 1000 }],
      [pendingDeposit],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ moneyAdded: 0, marketChange: 100 });
  });

  it("leaves split values null for cash accounts", () => {
    const [change] = accountChanges(
      [account("cash", 1100)],
      [{ accountId: "cash", date: "2026-10-16", balance: 1000 }],
      [transaction("cash", "2026-10-17", 100, "deposit")],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ isNew: false, moneyAdded: null, marketChange: null });
  });

  it("leaves split values null for new investment accounts", () => {
    const [change] = accountChanges(
      [account("new-investment", 1100, "investment", "brokerage")],
      [{ accountId: "new-investment", date: "2026-10-23", balance: 1100 }],
      [transaction("new-investment", "2026-10-22", 100, "deposit")],
      "2026-10-23",
      7,
    );

    expect(change).toMatchObject({ isNew: true, moneyAdded: null, marketChange: null });
  });

  it("reconciles account changes with header deltas when all accounts have history", () => {
    const accounts = [
      account("cash", 1200),
      account("investment", 5200, "investment", "brokerage"),
      account("liability", -700, "liability", "credit_card"),
    ];
    const snapshots = [
      { accountId: "cash", date: "2026-09-23", balance: 1000 },
      { accountId: "cash", date: "2026-10-16", balance: 1100 },
      { accountId: "cash", date: "2026-10-22", balance: 1190 },
      { accountId: "investment", date: "2026-09-23", balance: 4800 },
      { accountId: "investment", date: "2026-10-16", balance: 5000 },
      { accountId: "investment", date: "2026-10-22", balance: 5100 },
      { accountId: "liability", date: "2026-09-23", balance: -600 },
      { accountId: "liability", date: "2026-10-16", balance: -650 },
      { accountId: "liability", date: "2026-10-22", balance: -690 },
    ];
    const series = netWorthSeries(accounts, snapshots, "2026-10-23");
    const summary = applyNetWorthChange(computeNetWorth(accounts), series);

    for (const [period, days] of [
      ["day", 1],
      ["week", 7],
      ["month", 30],
    ] as const) {
      const total = accountChanges(accounts, snapshots, [], "2026-10-23", days).reduce(
        (sum, entry) => sum + (entry.change ?? 0),
        0,
      );
      expect(total).toBe(summary.change[period]);
    }
  });
});

describe("Roth contributions", () => {
  it("counts gross deposits separately from withdrawals and excludes fees", () => {
    const result = rothContributions(
      [
        account("roth", 0, "retirement", "roth_ira"),
        account("cash", 0),
      ],
      [
        transaction("roth", "2026-02-01", 2500, "deposit"),
        transaction("roth", "2026-03-01", -800, "withdrawal"),
        transaction("roth", "2026-03-02", -50, "fee"),
        transaction("cash", "2026-03-03", 1000, "deposit"),
        transaction("roth", "2025-12-31", 500, "deposit"),
      ],
      2026,
    );

    expect(result).toMatchObject({ deposits: 2500, withdrawals: 800 });
    expect(isWithdrawal(transaction("roth", "2026-03-02", -50, "fee"))).toBe(false);
  });

  it("uses the explicit Roth tax year and falls back to the transaction year", () => {
    const result = rothContributions(
      [account("roth", 0, "retirement", "roth_ira")],
      [
        { ...transaction("roth", "2026-03-10", 200, "deposit"), taxYear: 2025 },
        transaction("roth", "2025-03-10", 100, "deposit"),
      ],
      2025,
    );
    expect(result.deposits).toBe(300);
    expect(rothContributions(
      [account("roth", 0, "retirement", "roth_ira")],
      [transaction("roth", "2026-03-10", 200, "deposit")],
      2026,
    ).deposits).toBe(200);
  });
});

describe("Plaid account mapping", () => {
  it.each<[string, string, string]>([
    ["depository", "checking", "checking"],
    ["depository", "savings", "savings"],
    ["credit", "credit card", "credit_card"],
    ["investment", "ira", "traditional_ira"],
    ["investment", "traditional ira", "traditional_ira"],
    ["investment", "sep ira", "traditional_ira"],
    ["investment", "simple ira", "traditional_ira"],
    ["investment", "roth ira", "roth_ira"],
    ["investment", "401k", "401k"],
    ["investment", "403b", "401k"],
    ["investment", "457b", "401k"],
    ["loan", "student", "loan"],
  ])("maps %s/%s to %s", (type, subtype, expected) => {
    expect(plaidAccountType(type, subtype)).toBe(expected);
  });

  it("uses the account name to recognize Roth IRA accounts with generic IRA subtype", () => {
    expect(plaidAccountType("investment", "ira", "ROTH IRA")).toBe("roth_ira");
  });

  it("keeps Roth 401(k) accounts classified as 401(k)", () => {
    expect(plaidAccountType("investment", "ira", "Roth 401(k)")).toBe("401k");
    expect(plaidAccountType("investment", "roth_401k", "Roth 401k")).toBe("401k");
  });
});

describe("Plaid transaction conversion", () => {
  const transaction = (primary: string) =>
    convertPlaidTransaction({
      transaction_id: "txn-1",
      account_id: "acct-1",
      date: "2026-01-02",
      name: "Example",
      amount: 12.5,
      personal_finance_category: { primary },
    });

  it("inverts Plaid's amount sign", () => {
    expect(transaction("FOOD_AND_DRINK").amount).toBe(-12.5);
  });

  it("suggests app transfer types for transfer categories", () => {
    expect(transaction("TRANSFER_IN").suggestedType).toBe("transfer_in");
    expect(transaction("TRANSFER_OUT").suggestedType).toBe("transfer_out");
  });

  it("leaves non-transfer suggestions undefined", () => {
    expect(transaction("INCOME").suggestedType).toBeUndefined();
  });
});

describe("classifyType", () => {
  it.each<[string, number]>([
    ["deposit", 100],
    ["employer contribution", 100],
    ["deposit", -100],
    ["transfer in", 100],
    ["transfer out", -100],
  ])("never infers a deposit for %s", (name, amount) => {
    expect(classifyType(name, amount)).not.toBe("deposit");
  });

  it("does not classify a negative interest charge as interest", () => {
    expect(classifyType("INTEREST CHARGE ON PURCHASES", -25.13)).not.toBe("interest");
  });
});

describe("normalizeTransactionAmount", () => {
  it.each([
    ["deposit", -50, 50],
    ["income", -50, 50],
    ["dividend", -50, 50],
    ["interest", -50, 50],
    ["transfer_in", -50, 50],
    ["sell", -50, 50],
    ["withdrawal", 50, -50],
    ["expense", 50, -50],
    ["fee", 50, -50],
    ["transfer_out", 50, -50],
    ["buy", 50, -50],
    ["other", -50, -50],
  ])("normalizes %s", (type, amount, expected) => {
    expect(normalizeTransactionAmount(amount, type)).toBe(expected);
  });
});

describe("buildTransferLegs", () => {
  it("builds paired signed transfer rows", () => {
    const legs = buildTransferLegs(
      {
        fromAccountId: "account-a",
        toAccountId: "account-b",
        amount: 25,
        date: "2026-03-01",
        note: "  Rent split  ",
      },
      "pair-1",
    );

    expect(legs).toEqual([
      {
        account_id: "account-a",
        date: "2026-03-01",
        name: "Rent split",
        amount: -25,
        type: "transfer_out",
        transfer_pair_id: "pair-1",
      },
      {
        account_id: "account-b",
        date: "2026-03-01",
        name: "Rent split",
        amount: 25,
        type: "transfer_in",
        transfer_pair_id: "pair-1",
      },
    ]);
  });
});

describe("summarizeActivity", () => {
  it("excludes transfers from in/out and counts only investment deposits", () => {
    const account = (id: string, assetClass: Account["assetClass"]): Account => ({
      id,
      institutionId: "institution",
      name: id,
      type: "other",
      assetClass,
      currency: "USD",
      currentBalance: 0,
      lastSyncedAt: null,
      isManual: true,
      connectionStatus: "manual",
    });
    const transaction = (
      id: string,
      accountId: string,
      amount: number,
      type: Transaction["type"],
    ): Transaction => ({
      id,
      accountId,
      date: "2026-03-01",
      name: type,
      amount,
      type,
      typeOverridden: false,
      pending: false,
    });
    const accounts = [
      account("checking", "cash"),
      account("brokerage", "investment"),
      account("retirement", "retirement"),
    ];
    const transactions = [
      transaction("1", "brokerage", 200, "deposit"),
      transaction("2", "retirement", 50, "transfer_in"),
      transaction("3", "checking", -50, "transfer_out"),
      transaction("4", "checking", -20, "expense"),
      transaction("5", "checking", 10, "deposit"),
      transaction("6", "retirement", -5, "withdrawal"),
      transaction("7", "checking", 30, "income"),
      transaction("8", "brokerage", -5000, "buy"),
      transaction("9", "brokerage", 4000, "sell"),
      transaction("10", "checking", 15, "interest"),
      transaction("11", "brokerage", 5, "dividend"),
    ];

    expect(summarizeActivity(transactions, accounts)).toEqual({
      moneyIn: 240,
      moneyOut: 25,
      interestAndDividends: 20,
      contributions: 250,
    });
  });

  it("keeps Activity summary totals equal to the visible month totals on demo data", () => {
    const { accounts, transactions } = demoDataset;
    const summary = summarizeActivity(transactions, accounts, transactions);
    const groups = groupByMonth(transactions, transactions, accounts, transactions);
    expect(groups.reduce((sum, group) => sum + group.moneyIn, 0)).toBeCloseTo(summary.moneyIn, 2);
    expect(groups.reduce((sum, group) => sum + group.moneyOut, 0)).toBeCloseTo(summary.moneyOut, 2);
  });
});
