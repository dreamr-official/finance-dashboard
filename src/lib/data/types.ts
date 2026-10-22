import {
  Account,
  BalanceSnapshot,
  Holding,
  Institution,
  Subscription,
  Transaction,
} from "../types";

export interface Dataset {
  institutions: Institution[];
  accounts: Account[];
  snapshots: BalanceSnapshot[];
  transactions: Transaction[];
  holdings: Holding[];
  subscriptions: Subscription[];
}
