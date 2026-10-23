import type { Account, AccountType, AssetClass } from "./types";

export const ASSET_CLASS: Record<AccountType, AssetClass> = {
  checking: "cash",
  savings: "cash",
  cash: "cash",
  brokerage: "investment",
  roth_ira: "retirement",
  traditional_ira: "retirement",
  "401k": "retirement",
  credit_card: "liability",
  loan: "liability",
  other: "other",
};

export function assetClassForType(type: string): AssetClass {
  return ASSET_CLASS[type as AccountType] ?? "other";
}

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "brokerage", label: "Brokerage" },
  { value: "roth_ira", label: "Roth IRA" },
  { value: "traditional_ira", label: "Traditional IRA" },
  { value: "401k", label: "401(k)" },
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "other", label: "Other" },
];

export function deriveAccountTypeUpdate(
  account: Pick<Account, "type" | "assetClass" | "currentBalance">,
  input: { type?: AccountType; current_balance?: number; name?: string },
) {
  const update: {
    type?: AccountType;
    asset_class?: AssetClass;
    current_balance?: number;
    name?: string;
  } = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.type !== undefined) {
    update.type = input.type;
    update.asset_class = ASSET_CLASS[input.type];
  }
  const nextAssetClass = input.type ? ASSET_CLASS[input.type] : account.assetClass;
  const wasLiability =
    account.assetClass === "liability" ||
    account.type === "credit_card" ||
    account.type === "loan";
  const becomesLiability = nextAssetClass === "liability";
  const typeChanged = input.type !== undefined && input.type !== account.type;
  if (
    input.current_balance !== undefined ||
    (typeChanged && (wasLiability || becomesLiability))
  ) {
    const balance = input.current_balance ?? account.currentBalance;
    update.current_balance = becomesLiability
      ? -Math.abs(balance)
      : wasLiability
        ? Math.abs(balance)
        : balance;
  }
  return update;
}
