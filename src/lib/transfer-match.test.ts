import { describe, expect, it } from "vitest";
import { demoDataset } from "./demo-data";
import {
  buildTransferReport,
  matchTransfers,
  transferDirection,
} from "./transfer-match";
import type { Account, Transaction } from "./types";

function account(
  id: string,
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
    currentBalance: 0,
    lastSyncedAt: null,
    isManual: true,
    connectionStatus: "manual",
  };
}

function transaction(
  id: string,
  accountId: string,
  date: string,
  amount: number,
  type: Transaction["type"] = "transfer_out",
  options: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    accountId,
    date,
    name: id,
    amount,
    type,
    ...options,
  };
}

function out(
  id: string,
  date: string,
  amount: number,
  accountId = "bank",
  options: Partial<Transaction> = {},
): Transaction {
  return transaction(id, accountId, date, -amount, "transfer_out", options);
}

function incoming(
  id: string,
  date: string,
  amount: number,
  accountId = "savings",
  options: Partial<Transaction> = {},
): Transaction {
  return transaction(id, accountId, date, amount, "transfer_in", options);
}

describe("transferDirection", () => {
  const cash = account("bank");

  it.each<[string, Transaction, Account, "out" | "in" | null]>([
    ["transfer_out", transaction("out", "bank", "2026-03-01", -1), cash, "out"],
    [
      "transfer_in",
      transaction("in", "bank", "2026-03-01", 1, "transfer_in"),
      cash,
      "in",
    ],
    [
      "typed Online Banking transfer",
      transaction("online", "bank", "2026-03-01", -1, "expense", {
        name: "Online Banking transfer to Fidelity",
      }),
      cash,
      "out",
    ],
    [
      "ACH to Robinhood",
      transaction("ach", "bank", "2026-03-01", -1, "expense", {
        name: "ACH to Robinhood",
      }),
      cash,
      "out",
    ],
    [
      "Roth deposit",
      transaction("roth", "roth", "2026-03-01", 100, "deposit", {
        name: "Roth contribution",
      }),
      account("roth", "retirement", "roth_ira"),
      "in",
    ],
    [
      "401(k) payroll contribution",
      transaction("401k", "401k", "2026-03-01", 100, "deposit", {
        name: "401(k) payroll contribution",
      }),
      account("401k", "retirement", "401k"),
      null,
    ],
    [
      "Employer match",
      transaction("match", "brokerage", "2026-03-01", 100, "deposit", {
        name: "Employer match",
      }),
      account("brokerage", "investment", "brokerage"),
      null,
    ],
    ...(["buy", "sell", "dividend", "interest"] as const).map((type) => [
      `${type} is excluded`,
      transaction(type, "bank", "2026-03-01", -1, type),
      cash,
      null,
    ] as [string, Transaction, Account, null]),
    [
      "groceries expense",
      transaction("groceries", "bank", "2026-03-01", -25, "expense", {
        name: "Groceries",
      }),
      cash,
      null,
    ],
    [
      "Zelle transfer_out",
      transaction("zelle", "bank", "2026-03-01", -10, "transfer_out", {
        name: "Zelle to Alex",
      }),
      cash,
      null,
    ],
    [
      "credit card purchase",
      transaction("purchase", "card", "2026-03-01", -25, "expense", {
        name: "Coffee shop",
      }),
      account("card", "liability", "credit_card"),
      null,
    ],
    [
      "credit card payment",
      transaction("card-payment", "card", "2026-03-01", 500, "income", {
        name: "Payment Thank You",
      }),
      account("card", "liability", "credit_card"),
      "in",
    ],
    [
      "bank card autopay",
      transaction("autopay", "bank", "2026-03-01", -500, "expense", {
        name: "Chase Card Autopay",
      }),
      cash,
      "out",
    ],
    [
      "user-overridden expense",
      transaction("override", "bank", "2026-03-01", -10, "expense", {
        name: "Transfer to mom",
        typeOverridden: true,
      }),
      cash,
      null,
    ],
    [
      "linked Zelle transaction",
      transaction("linked-zelle", "bank", "2026-03-01", -10, "expense", {
        name: "Zelle to Alex",
        transferPairId: "link",
      }),
      cash,
      "out",
    ],
    [
      "transfer type with wrong sign",
      transaction("wrong-out", "bank", "2026-03-01", 10, "transfer_out"),
      cash,
      null,
    ],
  ])("%s", (_label, txn, txnAccount, expected) => {
    expect(transferDirection(txn, txnAccount)).toBe(expected);
  });

  it("accepts Plaid transfer categories on cash and liability accounts", () => {
    expect(
      transferDirection(
        transaction("cash-category", "bank", "2026-03-01", 15, "other", {
          category: "LOAN_PAYMENTS",
        }),
        cash,
      ),
    ).toBe("in");
    expect(
      transferDirection(
        transaction("loan-payment", "loan", "2026-03-01", 15, "other", {
          category: "LOAN_PAYMENTS",
        }),
        account("loan", "liability", "loan"),
      ),
    ).toBe("in");
  });
});

describe("matchTransfers confirmed links", () => {
  it("confirms a linked pair even when its dates are nine days apart", () => {
    const result = matchTransfers(
      [
        out("linked-out", "2026-03-01", 125, "bank", { transferPairId: "pair" }),
        incoming("linked-in", "2026-03-10", 125, "brokerage", {
          transferPairId: "pair",
        }),
      ],
      [account("bank"), account("brokerage", "investment", "brokerage")],
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      id: "linked-out:linked-in",
      confirmed: true,
      lagDays: 9,
    });
    expect(result.unmatched).toEqual([]);
  });

  it("leaves linked legs unmatched when their amounts differ by more than a cent", () => {
    const result = matchTransfers(
      [
        out("linked-out", "2026-03-01", 100, "bank", { transferPairId: "pair" }),
        incoming("linked-in", "2026-03-01", 105, "savings", {
          transferPairId: "pair",
        }),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs).toEqual([]);
    expect(result.unmatched.map(({ leg }) => leg.id)).toEqual([
      "linked-out",
      "linked-in",
    ]);
  });
});

describe("matchTransfers greedy matching", () => {
  it("matches amounts within the five-day window, including exactly five days", () => {
    const result = matchTransfers(
      [
        out("within", "2026-03-01", 20),
        incoming("at-limit", "2026-03-06", 20),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].lagDays).toBe(5);
  });

  it("does not match legs six days apart", () => {
    const result = matchTransfers(
      [out("old-out", "2026-03-01", 20), incoming("late-in", "2026-03-07", 20)],
      [account("bank"), account("savings")],
    );

    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toHaveLength(2);
  });

  it.each([
    [0.01, 1],
    [0.02, 0],
  ])("allows an amount difference of $%s", (difference, expectedPairs) => {
    const result = matchTransfers(
      [out("out", "2026-03-01", 100), incoming("in", "2026-03-01", 100 + difference)],
      [account("bank"), account("savings")],
    );

    expect(result.pairs).toHaveLength(expectedPairs);
  });

  it("never matches a transaction to another leg in the same account", () => {
    const result = matchTransfers(
      [out("out", "2026-03-01", 50, "bank"), incoming("in", "2026-03-01", 50, "bank")],
      [account("bank")],
    );

    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toHaveLength(2);
  });

  it("chooses the closest date and leaves the other incoming leg unmatched", () => {
    const result = matchTransfers(
      [
        out("out", "2026-03-10", 1000),
        incoming("three-days", "2026-03-13", 1000),
        incoming("one-day", "2026-03-11", 1000),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs.map((pair) => pair.in.id)).toEqual(["one-day"]);
    expect(result.unmatched.map(({ leg }) => leg.id)).toEqual(["three-days"]);
  });

  it("prefers an incoming leg dated after the outflow when lag magnitudes tie", () => {
    const result = matchTransfers(
      [
        out("out", "2026-03-10", 100),
        incoming("before", "2026-03-09", 100),
        incoming("after", "2026-03-11", 100),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs[0].in.id).toBe("after");
  });

  it("uses transaction ids as a deterministic tie-breaker", () => {
    const result = matchTransfers(
      [
        out("out-z", "2026-03-10", 100),
        out("out-a", "2026-03-10", 100),
        incoming("in", "2026-03-10", 100),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs[0].out.id).toBe("out-a");
    expect(result.unmatched[0].leg.id).toBe("out-z");
  });

  it("uses each leg at most once", () => {
    const result = matchTransfers(
      [
        out("out-1", "2026-03-10", 500),
        out("out-2", "2026-03-10", 500),
        incoming("in-1", "2026-03-10", 500),
        incoming("in-2", "2026-03-10", 500),
      ],
      [account("bank"), account("savings")],
    );

    expect(result.pairs).toHaveLength(2);
    expect(new Set(result.pairs.map((pair) => pair.out.id)).size).toBe(2);
    expect(new Set(result.pairs.map((pair) => pair.in.id)).size).toBe(2);
    expect(result.unmatched).toEqual([]);
  });

  it("classifies a bank-to-card pair and its route as a card payment", () => {
    const result = matchTransfers(
      [
        transaction("card-out", "bank", "2026-03-01", -500, "expense", {
          name: "Chase Card Autopay",
        }),
        transaction("card-in", "card", "2026-03-01", 500, "income", {
          name: "Payment Thank You",
        }),
      ],
      [account("bank"), account("card", "liability", "credit_card")],
    );
    const report = buildTransferReport(
      [
        transaction("report-out", "bank", "2026-03-01", -500, "expense", {
          name: "Chase Card Autopay",
        }),
        transaction("report-in", "card", "2026-03-01", 500, "income", {
          name: "Payment Thank You",
        }),
      ],
      [account("bank"), account("card", "liability", "credit_card")],
      { today: "2026-03-20" },
    );

    expect(result.pairs[0].kind).toBe("card_payment");
    expect(report.routes[0].kind).toBe("card_payment");
  });
});

describe("buildTransferReport", () => {
  it("keeps a pair spanning the from boundary and filters by account", () => {
    const accounts = [
      account("bank"),
      account("savings"),
      account("brokerage", "investment", "brokerage"),
    ];
    const transactions = [
      out("boundary-out", "2026-03-01", 100, "bank"),
      incoming("boundary-in", "2026-03-03", 100, "savings"),
      out("other-out", "2026-03-03", 200, "savings"),
      incoming("other-in", "2026-03-03", 200, "brokerage"),
      out("bank-unmatched", "2026-03-03", 300, "bank"),
    ];

    const boundaryReport = buildTransferReport(transactions, accounts, {
      today: "2026-03-20",
      from: "2026-03-02",
    });
    expect(boundaryReport.pairs.map((pair) => pair.id)).toContain(
      "boundary-out:boundary-in",
    );

    const accountReport = buildTransferReport(transactions, accounts, {
      today: "2026-03-20",
      accountId: "brokerage",
    });
    expect(accountReport.pairs.map((pair) => pair.id)).toEqual([
      "other-out:other-in",
    ]);
    expect(accountReport.unmatchedOut).toEqual([]);
  });

  it("marks unmatched legs pending by date or transaction status and aggregates the report", () => {
    const accounts = [account("bank"), account("savings"), account("brokerage")];
    const report = buildTransferReport(
      [
        out("route-100", "2026-03-15", 100.1, "bank"),
        incoming("route-100-in", "2026-03-15", 100.1, "savings"),
        out("route-200", "2026-03-17", 200.2, "bank"),
        incoming("route-200-in", "2026-03-17", 200.2, "savings"),
        out("route-500", "2026-03-18", 500, "savings"),
        incoming("route-500-in", "2026-03-18", 500, "brokerage"),
        out("recent", "2026-03-17", 40, "bank"),
        out("old", "2026-03-10", 60, "bank"),
        out("pending-old", "2026-02-18", 70, "bank", { pending: true }),
      ],
      accounts,
      { today: "2026-03-20" },
    );

    expect(report.pairs.map((pair) => pair.out.id)).toEqual([
      "route-500",
      "route-200",
      "route-100",
    ]);
    expect(report.unmatchedOut.map((leg) => [leg.transaction.id, leg.status])).toEqual([
      ["recent", "pending"],
      ["old", "needs_review"],
      ["pending-old", "pending"],
    ]);
    expect(report.routes).toMatchObject([
      { key: "savings->brokerage", total: 500, count: 1, lastDate: "2026-03-18" },
      { key: "bank->savings", total: 300.3, count: 2, lastDate: "2026-03-17" },
    ]);
    expect(report.summary).toEqual({
      matched: { count: 3, total: 800.3 },
      needsReview: { count: 1, total: 60 },
      pending: { count: 2, total: 110 },
    });
  });

  it("orders pairs by their newest leg date, then by pair id", () => {
    const report = buildTransferReport(
      [
        out("out-later-in", "2026-03-01", 100),
        incoming("in-later-in", "2026-03-05", 100),
        out("out-middle", "2026-03-04", 200),
        incoming("in-middle", "2026-03-04", 200),
        out("out-earlier", "2026-03-03", 300),
        incoming("in-earlier", "2026-03-03", 300),
      ],
      [account("bank"), account("savings")],
      { today: "2026-03-20" },
    );

    expect(report.pairs.map((pair) => pair.id)).toEqual([
      "out-later-in:in-later-in",
      "out-middle:in-middle",
      "out-earlier:in-earlier",
    ]);
  });
});

describe("demo transfer pairs", () => {
  it("confirms every explicitly linked demo transfer without same-account pairs", () => {
    const { pairs } = matchTransfers(demoDataset.transactions, demoDataset.accounts);
    const linkedPairIds = new Set(
      demoDataset.transactions
        .map((txn) => txn.transferPairId)
        .filter((id): id is string => id !== undefined),
    );
    const confirmedPairIds = new Set(
      pairs
        .filter((pair) => pair.confirmed)
        .map((pair) => pair.out.transferPairId)
        .filter((id): id is string => id !== undefined),
    );

    expect(confirmedPairIds).toEqual(linkedPairIds);
    expect(pairs.every((pair) => pair.from.id !== pair.to.id)).toBe(true);
  });
});
