import type { Account, Transaction } from "./types";

export const TRANSFER_NAME_PATTERNS: RegExp[] = [
  /transfer/i,
  /xfer/i,
  /fidelity/i,
  /robinhood/i,
  /schwab/i,
  /vanguard/i,
  /moneyline/i,
  /ach (to|from)/i,
  /online banking/i,
];
export const CARD_PAYMENT_NAME_PATTERNS: RegExp[] = [
  /credit card/i,
  /card payment/i,
  /crd epay/i,
  /epayment/i,
  /autopay/i,
  /payment.*thank you/i,
  /applecard/i,
  /amex/i,
  /discover/i,
  /capital one/i,
  /citi card/i,
  /chase card/i,
];
/** Person-to-person apps: money to other people, not between owned accounts. */
export const PEER_PAYMENT_PATTERNS: RegExp[] = [/zelle/i, /venmo/i, /cash app/i, /paypal/i];
/** Deposits into investment accounts that are not funded from a bank. */
export const NON_BANK_DEPOSIT_PATTERNS: RegExp[] = [
  /payroll/i,
  /employer/i,
  /\bmatch\b/i,
  /rollover/i,
  /reinvest/i,
];
export const MATCH_WINDOW_DAYS = 5;
export const AMOUNT_TOLERANCE_CENTS = 1;

export type TransferDirection = "out" | "in";
export type TransferKind = "transfer" | "card_payment" | "loan_payment";
export type UnmatchedStatus = "pending" | "needs_review";

export interface TransferPair {
  id: string;
  out: Transaction;
  in: Transaction;
  from: Account;
  to: Account;
  amount: number;
  outDate: string;
  inDate: string;
  lagDays: number;
  confirmed: boolean;
  kind: TransferKind;
}

export interface UnmatchedLeg {
  transaction: Transaction;
  account: Account;
  direction: TransferDirection;
  amount: number;
  status: UnmatchedStatus;
}

export interface TransferRoute {
  key: string;
  from: Account;
  to: Account;
  kind: TransferKind;
  total: number;
  count: number;
  lastDate: string;
}

export interface TransferSummary {
  matched: { count: number; total: number };
  needsReview: { count: number; total: number };
  pending: { count: number; total: number };
}

export interface TransferReport {
  pairs: TransferPair[];
  unmatchedOut: UnmatchedLeg[];
  unmatchedIn: UnmatchedLeg[];
  routes: TransferRoute[];
  summary: TransferSummary;
}

export interface TransferReportOptions {
  today: string;
  from?: string;
  to?: string;
  accountId?: string;
}

interface CandidateLeg {
  transaction: Transaction;
  account: Account;
  direction: TransferDirection;
  cents: number;
}

interface MatchResult {
  pairs: TransferPair[];
  unmatched: { leg: Transaction; account: Account; direction: TransferDirection }[];
}

const EXCLUDED_TRANSACTION_TYPES = new Set<Transaction["type"]>([
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
]);

function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(name));
}

export function transferDirection(
  t: Transaction,
  account: Account,
): TransferDirection | null {
  if (t.amount === 0) return null;

  const direction: TransferDirection = t.amount < 0 ? "out" : "in";

  if (t.transferPairId !== undefined) return direction;
  if (EXCLUDED_TRANSACTION_TYPES.has(t.type)) return null;
  if (matchesAny(t.name, PEER_PAYMENT_PATTERNS)) return null;

  if (t.type === "transfer_out") return direction === "out" ? "out" : null;
  if (t.type === "transfer_in") return direction === "in" ? "in" : null;

  if (
    t.type === "deposit" &&
    direction === "in" &&
    (account.assetClass === "investment" || account.assetClass === "retirement") &&
    account.type !== "401k" &&
    !matchesAny(t.name, NON_BANK_DEPOSIT_PATTERNS)
  ) {
    return "in";
  }

  if (
    t.type === "withdrawal" &&
    direction === "out" &&
    (account.assetClass === "investment" || account.assetClass === "retirement")
  ) {
    return "out";
  }

  if (t.typeOverridden && (t.type === "expense" || t.type === "income")) return null;

  if (account.assetClass === "cash") {
    if (
      matchesAny(t.name, TRANSFER_NAME_PATTERNS) ||
      (direction === "out" && matchesAny(t.name, CARD_PAYMENT_NAME_PATTERNS)) ||
      t.category === "TRANSFER_IN" ||
      t.category === "TRANSFER_OUT" ||
      t.category === "LOAN_PAYMENTS"
    ) {
      return direction;
    }
  }

  if (
    account.assetClass === "liability" &&
    direction === "in" &&
    (matchesAny(t.name, CARD_PAYMENT_NAME_PATTERNS) ||
      /payment/i.test(t.name) ||
      t.category === "TRANSFER_IN" ||
      t.category === "LOAN_PAYMENTS")
  ) {
    return "in";
  }

  return null;
}

function dateUtc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function differenceInDays(from: string, to: string): number {
  return (dateUtc(to) - dateUtc(from)) / 86400000;
}

function transferKind(to: Account): TransferKind {
  if (to.type === "credit_card") return "card_payment";
  if (to.type === "loan") return "loan_payment";
  return "transfer";
}

function makePair(out: CandidateLeg, incoming: CandidateLeg, confirmed: boolean): TransferPair {
  const outDate = out.transaction.date;
  const inDate = incoming.transaction.date;
  return {
    id: `${out.transaction.id}:${incoming.transaction.id}`,
    out: out.transaction,
    in: incoming.transaction,
    from: out.account,
    to: incoming.account,
    amount: Math.abs(out.transaction.amount),
    outDate,
    inDate,
    lagDays: differenceInDays(outDate, inDate),
    confirmed,
    kind: transferKind(incoming.account),
  };
}

function cents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

export function matchTransfers(
  transactions: Transaction[],
  accounts: Account[],
): MatchResult {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const legs: CandidateLeg[] = [];

  for (const transaction of transactions) {
    const account = accountsById.get(transaction.accountId);
    if (!account) continue;
    const direction = transferDirection(transaction, account);
    if (!direction) continue;
    legs.push({ transaction, account, direction, cents: cents(transaction.amount) });
  }

  const pairs: TransferPair[] = [];
  const usedLegs = new Set<CandidateLeg>();
  const linkedGroups = new Map<string, CandidateLeg[]>();

  for (const leg of legs) {
    const pairId = leg.transaction.transferPairId;
    if (pairId === undefined) continue;
    const group = linkedGroups.get(pairId) ?? [];
    group.push(leg);
    linkedGroups.set(pairId, group);
  }

  for (const group of linkedGroups.values()) {
    if (group.length !== 2) continue;
    const out = group.find((leg) => leg.direction === "out");
    const incoming = group.find((leg) => leg.direction === "in");
    if (
      !out ||
      !incoming ||
      out.account.id === incoming.account.id ||
      Math.abs(out.cents - incoming.cents) > AMOUNT_TOLERANCE_CENTS
    ) {
      continue;
    }
    pairs.push(makePair(out, incoming, true));
    usedLegs.add(out);
    usedLegs.add(incoming);
  }

  const remainingOut = legs.filter((leg) => leg.direction === "out" && !usedLegs.has(leg));
  const remainingIn = legs.filter((leg) => leg.direction === "in" && !usedLegs.has(leg));
  const incomingByCents = new Map<number, CandidateLeg[]>();
  for (const incoming of remainingIn) {
    const bucket = incomingByCents.get(incoming.cents) ?? [];
    bucket.push(incoming);
    incomingByCents.set(incoming.cents, bucket);
  }

  const candidates: {
    out: CandidateLeg;
    incoming: CandidateLeg;
    lagDays: number;
  }[] = [];
  for (const out of remainingOut) {
    for (
      let amountCents = out.cents - AMOUNT_TOLERANCE_CENTS;
      amountCents <= out.cents + AMOUNT_TOLERANCE_CENTS;
      amountCents += 1
    ) {
      for (const incoming of incomingByCents.get(amountCents) ?? []) {
        if (out.account.id === incoming.account.id) continue;
        const lagDays = differenceInDays(out.transaction.date, incoming.transaction.date);
        if (Math.abs(lagDays) > MATCH_WINDOW_DAYS) continue;
        candidates.push({ out, incoming, lagDays });
      }
    }
  }

  candidates.sort(
    (left, right) =>
      Math.abs(left.lagDays) - Math.abs(right.lagDays) ||
      Number(left.lagDays < 0) - Number(right.lagDays < 0) ||
      left.out.transaction.id.localeCompare(right.out.transaction.id) ||
      left.incoming.transaction.id.localeCompare(right.incoming.transaction.id),
  );

  for (const candidate of candidates) {
    if (usedLegs.has(candidate.out) || usedLegs.has(candidate.incoming)) continue;
    pairs.push(makePair(candidate.out, candidate.incoming, false));
    usedLegs.add(candidate.out);
    usedLegs.add(candidate.incoming);
  }

  const unmatched = legs
    .filter((leg) => !usedLegs.has(leg))
    .map(({ transaction, account, direction }) => ({ leg: transaction, account, direction }));
  return { pairs, unmatched };
}

function isWithinRange(date: string, options: TransferReportOptions): boolean {
  return (!options.from || date >= options.from) && (!options.to || date <= options.to);
}

function roundedTotal(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + cents(amount), 0) / 100;
}

function daysBefore(date: string, days: number): string {
  const timestamp = dateUtc(date) - days * 86400000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function buildTransferReport(
  transactions: Transaction[],
  accounts: Account[],
  options: TransferReportOptions,
): TransferReport {
  const { pairs: allPairs, unmatched: allUnmatched } = matchTransfers(transactions, accounts);
  const latestPairDate = (pair: TransferPair) =>
    pair.outDate > pair.inDate ? pair.outDate : pair.inDate;
  const pairs = allPairs
    .filter(
      (pair) =>
        (isWithinRange(pair.outDate, options) || isWithinRange(pair.inDate, options)) &&
        (!options.accountId ||
          pair.from.id === options.accountId ||
          pair.to.id === options.accountId),
    )
    .sort(
      (left, right) =>
        latestPairDate(right).localeCompare(latestPairDate(left)) ||
        left.id.localeCompare(right.id),
    );
  const unmatchedLegs = allUnmatched
    .filter(
      ({ leg, account }) =>
        isWithinRange(leg.date, options) &&
        (!options.accountId || account.id === options.accountId),
    )
    .map<UnmatchedLeg>(({ leg, account, direction }) => ({
      transaction: leg,
      account,
      direction,
      amount: Math.abs(leg.amount),
      status:
        leg.pending || leg.date >= daysBefore(options.today, MATCH_WINDOW_DAYS)
          ? "pending"
          : "needs_review",
    }))
    .sort(
      (left, right) =>
        right.transaction.date.localeCompare(left.transaction.date) ||
        left.transaction.id.localeCompare(right.transaction.id),
    );
  const unmatchedOut = unmatchedLegs.filter((leg) => leg.direction === "out");
  const unmatchedIn = unmatchedLegs.filter((leg) => leg.direction === "in");

  const routeMap = new Map<string, { route: TransferRoute; totalCents: number }>();
  for (const pair of pairs) {
    const key = `${pair.from.id}->${pair.to.id}`;
    const routeState = routeMap.get(key) ?? {
      totalCents: 0,
      route: {
        key,
        from: pair.from,
        to: pair.to,
        kind: pair.kind,
        total: 0,
        count: 0,
        lastDate: pair.outDate,
      },
    };
    routeState.totalCents += cents(pair.amount);
    routeState.route.total = routeState.totalCents / 100;
    routeState.route.count += 1;
    if (pair.outDate > routeState.route.lastDate) {
      routeState.route.lastDate = pair.outDate;
    }
    routeMap.set(key, routeState);
  }
  const routes = Array.from(routeMap.values())
    .map(({ route }) => route)
    .sort((left, right) => right.total - left.total || left.key.localeCompare(right.key));

  const unmatchedTotal = (legs: UnmatchedLeg[]) => roundedTotal(legs.map((leg) => leg.amount));
  return {
    pairs,
    unmatchedOut,
    unmatchedIn,
    routes,
    summary: {
      matched: {
        count: pairs.length,
        total: roundedTotal(pairs.map((pair) => pair.amount)),
      },
      needsReview: {
        count: unmatchedLegs.filter((leg) => leg.status === "needs_review").length,
        total: unmatchedTotal(
          unmatchedLegs.filter((leg) => leg.status === "needs_review"),
        ),
      },
      pending: {
        count: unmatchedLegs.filter((leg) => leg.status === "pending").length,
        total: unmatchedTotal(unmatchedLegs.filter((leg) => leg.status === "pending")),
      },
    },
  };
}
