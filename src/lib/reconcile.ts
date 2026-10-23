import {
  CARD_PAYMENT_NAME_PATTERNS,
  MATCH_WINDOW_DAYS,
  NON_BANK_DEPOSIT_PATTERNS,
  PEER_PAYMENT_PATTERNS,
  matchTransfers,
  transferDirection,
} from "./transfer-match";
import { shiftDate } from "./dates";
import type { Account, Institution, Transaction } from "./types";

export interface FundingIssue {
  transaction: Transaction;
  account: Account;
  status: "in_transit" | "needs_review";
}

export interface FundingAccountTotal {
  account: Account;
  arrived: number;
}

export interface InvestmentFundingSummary {
  institutionId: string | null;
  institutionName: string;
  sentFromBanks: number;
  arrived: number;
  withdrawnToBanks: number;
  arrivedInBanks: number;
  difference: number;
  perAccount: FundingAccountTotal[];
  missingArrival: FundingIssue[];
  missingSource: FundingIssue[];
}

export interface ReconcileInvestmentFundingOptions {
  today: string;
  from?: string;
  to?: string;
  accountId?: string;
}

interface FundingState {
  institutionId: string | null;
  institutionName: string;
  sentCents: number;
  arrivedCents: number;
  withdrawnCents: number;
  arrivedInBanksCents: number;
  perAccountCents: Map<string, number>;
  missingArrival: FundingIssue[];
  missingSource: FundingIssue[];
}

const INVESTMENT_CLASSES = new Set<Account["assetClass"]>(["investment", "retirement"]);
const INSTITUTION_ALIASES: { name: RegExp; transaction: RegExp }[] = [
  { name: /fidelity/i, transaction: /fidelity|fid bkg|moneyline/i },
  { name: /robinhood/i, transaction: /robinhood/i },
  { name: /schwab/i, transaction: /schwab/i },
  { name: /vanguard/i, transaction: /vanguard/i },
  { name: /e\*?trade/i, transaction: /e\*?trade/i },
  { name: /webull/i, transaction: /webull/i },
  { name: /coinbase/i, transaction: /coinbase/i },
];

function cents(amount: number) {
  return Math.round(Math.abs(amount) * 100);
}

function inRange(date: string, options: ReconcileInvestmentFundingOptions) {
  return (!options.from || date >= options.from) && (!options.to || date <= options.to);
}

function isInvestment(account: Account) {
  return INVESTMENT_CLASSES.has(account.assetClass);
}

function isCash(account: Account) {
  return account.assetClass === "cash";
}

function statusFor(transaction: Transaction, today: string): FundingIssue["status"] {
  return transaction.pending || transaction.date >= shiftDate(today, -MATCH_WINDOW_DAYS)
    ? "in_transit"
    : "needs_review";
}

function institutionPattern(institutionName: string) {
  const alias = INSTITUTION_ALIASES.find(({ name }) => name.test(institutionName));
  if (alias) return alias.transaction;
  const firstWord = institutionName.trim().split(/\s+/)[0];
  return new RegExp(`\\b${firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

function matchesInstitution(transactionName: string, institutionName: string) {
  return institutionPattern(institutionName).test(transactionName);
}

function looksLikeExternalTransfer(transaction: Transaction, account: Account) {
  return (
    transferDirection(transaction, account) === "out" &&
    !PEER_PAYMENT_PATTERNS.some((pattern) => pattern.test(transaction.name)) &&
    !CARD_PAYMENT_NAME_PATTERNS.some((pattern) => pattern.test(transaction.name)) &&
    transaction.category !== "LOAN_PAYMENTS" &&
    !/\b(?:loan|mortgage) payment\b/i.test(transaction.name)
  );
}

export function reconcileInvestmentFunding(
  accounts: Account[],
  institutions: Institution[],
  transactions: Transaction[],
  options: ReconcileInvestmentFundingOptions,
): InvestmentFundingSummary[] {
  const institutionsById = new Map(institutions.map((institution) => [institution.id, institution]));
  const investmentAccounts = accounts.filter(isInvestment);
  const investmentAccountsByInstitution = new Map<string, Account[]>();
  for (const account of investmentAccounts) {
    const group = investmentAccountsByInstitution.get(account.institutionId) ?? [];
    group.push(account);
    investmentAccountsByInstitution.set(account.institutionId, group);
  }

  const states = new Map<string, FundingState>();
  const createState = (institutionId: string, name: string) => {
    const perAccountCents = new Map(
      (investmentAccountsByInstitution.get(institutionId) ?? []).map((account) => [
        account.id,
        0,
      ]),
    );
    const state: FundingState = {
      institutionId,
      institutionName: name,
      sentCents: 0,
      arrivedCents: 0,
      withdrawnCents: 0,
      arrivedInBanksCents: 0,
      perAccountCents,
      missingArrival: [],
      missingSource: [],
    };
    states.set(institutionId, state);
    return state;
  };
  const stateForAccount = (account: Account) => {
    const institution = institutionsById.get(account.institutionId);
    return (
      states.get(account.institutionId) ??
      createState(account.institutionId, institution?.name ?? account.institutionId)
    );
  };
  const matched = matchTransfers(transactions, accounts);

  for (const pair of matched.pairs) {
    if (isCash(pair.from) && isInvestment(pair.to)) {
      const state = stateForAccount(pair.to);
      const accountMatches =
        !options.accountId || pair.from.id === options.accountId || pair.to.id === options.accountId;
      if (accountMatches && inRange(pair.outDate, options)) state.sentCents += cents(pair.amount);
      if (accountMatches && inRange(pair.inDate, options)) {
        const amount = cents(pair.amount);
        state.arrivedCents += amount;
        state.perAccountCents.set(
          pair.to.id,
          (state.perAccountCents.get(pair.to.id) ?? 0) + amount,
        );
      }
    } else if (isInvestment(pair.from) && isCash(pair.to)) {
      const state = stateForAccount(pair.from);
      const accountMatches =
        !options.accountId || pair.from.id === options.accountId || pair.to.id === options.accountId;
      if (accountMatches && inRange(pair.outDate, options)) {
        state.withdrawnCents += cents(pair.amount);
      }
      if (accountMatches && inRange(pair.inDate, options)) {
        state.arrivedInBanksCents += cents(pair.amount);
      }
    }
  }

  const unmatched = matched.unmatched;
  const unknownState = (): FundingState => {
    let state = states.get("__unknown_destination");
    if (!state) {
      state = {
        institutionId: null,
        institutionName: "Unknown destination",
        sentCents: 0,
        arrivedCents: 0,
        withdrawnCents: 0,
        arrivedInBanksCents: 0,
        perAccountCents: new Map(),
        missingArrival: [],
        missingSource: [],
      };
      states.set("__unknown_destination", state);
    }
    return state;
  };

  for (const { leg: transaction, account, direction } of unmatched) {
    if (isCash(account) && direction === "out" && looksLikeExternalTransfer(transaction, account)) {
      if (!inRange(transaction.date, options)) continue;
      const institution = investmentAccounts
        .map((investmentAccount) => institutionsById.get(investmentAccount.institutionId))
        .filter((value): value is Institution => Boolean(value))
        .find((value) => matchesInstitution(transaction.name, value.name));
      const matchingAccounts = institution
        ? investmentAccountsByInstitution.get(institution.id) ?? []
        : [];
      if (
        options.accountId &&
        account.id !== options.accountId &&
        !matchingAccounts.some((investmentAccount) => investmentAccount.id === options.accountId)
      ) {
        continue;
      }
      const matchingAccount = matchingAccounts[0];
      if (institution && !matchingAccount) continue;
      const state = institution ? stateForAccount(matchingAccount!) : unknownState();
      const amount = cents(transaction.amount);
      state.sentCents += amount;
      state.missingArrival.push({
        transaction,
        account,
        status: statusFor(transaction, options.today),
      });
      continue;
    }

    if (isInvestment(account) && direction === "in") {
      if (
        (transaction.type !== "deposit" && transaction.type !== "transfer_in") ||
        NON_BANK_DEPOSIT_PATTERNS.some((pattern) => pattern.test(transaction.name)) ||
        !inRange(transaction.date, options) ||
        (options.accountId && account.id !== options.accountId)
      ) {
        continue;
      }
      const state = stateForAccount(account);
      const amount = cents(transaction.amount);
      state.arrivedCents += amount;
      state.perAccountCents.set(account.id, (state.perAccountCents.get(account.id) ?? 0) + amount);
      state.missingSource.push({
        transaction,
        account,
        status: statusFor(transaction, options.today),
      });
      continue;
    }

    if (isInvestment(account) && direction === "out") {
      if (!inRange(transaction.date, options) || (options.accountId && account.id !== options.accountId)) {
        continue;
      }
      stateForAccount(account).withdrawnCents += cents(transaction.amount);
      continue;
    }

    if (isCash(account) && direction === "in" && inRange(transaction.date, options)) {
      const institution = investmentAccounts
        .map((investmentAccount) => institutionsById.get(investmentAccount.institutionId))
        .filter((value): value is Institution => Boolean(value))
        .find((value) => matchesInstitution(transaction.name, value.name));
      if (!institution) continue;
      const matchingAccounts = investmentAccountsByInstitution.get(institution.id) ?? [];
      if (
        options.accountId &&
        account.id !== options.accountId &&
        !matchingAccounts.some((investmentAccount) => investmentAccount.id === options.accountId)
      ) {
        continue;
      }
      const matchingAccount = matchingAccounts[0];
      if (matchingAccount) {
        stateForAccount(matchingAccount).arrivedInBanksCents += cents(transaction.amount);
      }
    }
  }

  return [...states.values()]
    .filter(
      (state) =>
        state.sentCents ||
        state.arrivedCents ||
        state.withdrawnCents ||
        state.arrivedInBanksCents ||
        state.missingArrival.length ||
        state.missingSource.length,
    )
    .map((state) => ({
      institutionId: state.institutionId,
      institutionName: state.institutionName,
      sentFromBanks: state.sentCents / 100,
      arrived: state.arrivedCents / 100,
      withdrawnToBanks: state.withdrawnCents / 100,
      arrivedInBanks: state.arrivedInBanksCents / 100,
      difference: (state.sentCents - state.arrivedCents) / 100,
      perAccount: [...state.perAccountCents]
        .map(([accountId, amount]) => ({
          account: accounts.find((account) => account.id === accountId)!,
          arrived: amount / 100,
        }))
        .filter((value) => Boolean(value.account)),
      missingArrival: state.missingArrival,
      missingSource: state.missingSource,
    }))
    .sort((left, right) => {
      if (left.institutionId === null) return 1;
      if (right.institutionId === null) return -1;
      return left.institutionName.localeCompare(right.institutionName);
    });
}
