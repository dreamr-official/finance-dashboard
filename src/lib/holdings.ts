import { z } from "zod";
import type { Account, Holding } from "./types";
import { isLiability } from "./finance";

export const HOLDING_ASSET_TYPES = [
  "stock",
  "etf",
  "mutual_fund",
  "cash",
  "bond",
  "crypto",
  "other",
] as const satisfies readonly Holding["assetType"][];

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((s) => s.toUpperCase());
const name = z.string().trim().max(200);
const quantity = z.number().finite().positive();
const price = z.number().finite().nonnegative();
const money = z.number().finite();

export const holdingCreateSchema = z.object({
  symbol,
  name: name.optional(),
  quantity,
  price,
  value: money.nonnegative().optional(),
  cost_basis: money.nonnegative().nullable().optional(),
  asset_type: z.enum(HOLDING_ASSET_TYPES).default("other"),
});

export const holdingPatchSchema = holdingCreateSchema
  .partial()
  .extend({ asset_type: z.enum(HOLDING_ASSET_TYPES).optional() })
  .refine((body) => Object.keys(body).length > 0, "No fields to update");

export type HoldingCreateInput = z.infer<typeof holdingCreateSchema>;
export type HoldingPatchInput = z.infer<typeof holdingPatchSchema>;

export interface HoldingRow {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  cost_basis: number | null;
  asset_type: Holding["assetType"];
  as_of: string;
}

function roundCents(n: number) {
  return Math.round(n * 100) / 100;
}

/** Builds the DB row for a new manual holding; value defaults to quantity × price. */
export function toHoldingInsert(input: HoldingCreateInput, now = new Date()): HoldingRow {
  return {
    symbol: input.symbol,
    name: input.name || input.symbol,
    quantity: input.quantity,
    price: input.price,
    value: roundCents(input.value ?? input.quantity * input.price),
    cost_basis: input.cost_basis ?? null,
    asset_type: input.asset_type,
    as_of: now.toISOString(),
  };
}

/**
 * Builds the DB update for a manual holding. When quantity or price changes
 * without an explicit value, value is recomputed from the merged row.
 */
export function toHoldingUpdate(
  existing: Pick<HoldingRow, "quantity" | "price">,
  input: HoldingPatchInput,
  now = new Date(),
): Partial<HoldingRow> {
  const update: Partial<HoldingRow> = { as_of: now.toISOString() };
  if (input.symbol !== undefined) update.symbol = input.symbol;
  const nextName = input.name || (input.name !== undefined ? input.symbol : undefined);
  if (nextName) update.name = nextName;
  if (input.quantity !== undefined) update.quantity = input.quantity;
  if (input.price !== undefined) update.price = input.price;
  if (input.cost_basis !== undefined) update.cost_basis = input.cost_basis;
  if (input.asset_type !== undefined) update.asset_type = input.asset_type;
  if (input.value !== undefined) {
    update.value = roundCents(input.value);
  } else if (input.quantity !== undefined || input.price !== undefined) {
    const q = input.quantity ?? Number(existing.quantity);
    const p = input.price ?? Number(existing.price);
    update.value = roundCents(q * p);
  }
  return update;
}

export function canManageHoldings(account: Pick<Account, "isManual" | "assetClass">) {
  return (
    account.isManual &&
    (account.assetClass === "investment" || account.assetClass === "retirement")
  );
}

/** Sum of holdings minus account balance, or null when they agree (within a cent) or there are no holdings. */
export function holdingsBalanceGap(holdings: Pick<Holding, "value">[], balance: number) {
  if (!holdings.length) return null;
  const total = roundCents(holdings.reduce((sum, h) => sum + h.value, 0));
  const gap = roundCents(total - balance);
  return Math.abs(gap) < 0.01 ? null : { total, gap };
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export const ASSET_TYPE_LABEL: Record<Holding["assetType"], string> = {
  stock: "Stocks",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  bond: "Bonds",
  cash: "Cash",
  crypto: "Crypto",
  other: "Other",
};

export function toSlices(items: { key: string; label: string; value: number }[]): Slice[] {
  const kept = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = kept.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return [];
  return kept.map((item) => ({
    ...item,
    pct: (item.value / total) * 100,
  }));
}

export function capSlices(slices: Slice[], max = 6): Slice[] {
  if (slices.length <= max) return slices;
  const kept = slices.slice(0, max - 1);
  const rest = slices.slice(max - 1);
  const value = rest.reduce((sum, slice) => sum + slice.value, 0);
  const pct = rest.reduce((sum, slice) => sum + slice.pct, 0);
  return [...kept, { key: "__other", label: "Other", value, pct }];
}

export interface SymbolGroup extends Slice {
  symbol: string;
  name: string;
  quantity: number;
  costBasis?: number;
  accountIds: string[];
  assetType: Holding["assetType"];
}

export function groupHoldingsBySymbol(holdings: Holding[]): SymbolGroup[] {
  const groups = new Map<string, SymbolGroup>();
  for (const holding of holdings) {
    const symbol = holding.symbol.trim().toUpperCase();
    const existing = groups.get(symbol);
    if (existing) {
      existing.quantity += holding.quantity;
      existing.value += holding.value;
      if (holding.costBasis === undefined) {
        delete existing.costBasis;
      } else if (existing.costBasis !== undefined) {
        existing.costBasis += holding.costBasis;
      }
      if (!existing.accountIds.includes(holding.accountId)) {
        existing.accountIds.push(holding.accountId);
      }
    } else {
      groups.set(symbol, {
        key: symbol,
        label: symbol,
        symbol,
        name: holding.name,
        quantity: holding.quantity,
        value: holding.value,
        pct: 0,
        ...(holding.costBasis === undefined ? {} : { costBasis: holding.costBasis }),
        accountIds: [holding.accountId],
        assetType: holding.assetType,
      });
    }
  }
  const collected = [...groups.values()];
  const slices = toSlices(collected);
  const bySymbol = new Map(collected.map((group) => [group.key, group]));
  return slices.map((slice) => ({
    ...bySymbol.get(slice.key)!,
    pct: slice.pct,
  }));
}

export function groupHoldingsByAssetType(holdings: Holding[]): Slice[] {
  const values = new Map<Holding["assetType"], number>();
  for (const holding of holdings) {
    values.set(holding.assetType, (values.get(holding.assetType) ?? 0) + holding.value);
  }
  return toSlices(
    [...values].map(([assetType, value]) => ({
      key: assetType,
      label: ASSET_TYPE_LABEL[assetType],
      value,
    })),
  );
}

export function holdingsWithShare(holdings: Holding[]): (Holding & { pct: number })[] {
  const kept = holdings
    .filter((holding) => Number.isFinite(holding.value) && holding.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = kept.reduce((sum, holding) => sum + holding.value, 0);
  if (total === 0) return [];
  return kept.map((holding) => ({ ...holding, pct: (holding.value / total) * 100 }));
}

export function assetClassSlices(accounts: Account[]): Slice[] {
  const labels = {
    cash: "Cash",
    investment: "Investments",
    retirement: "Retirement",
    other: "Other assets",
  } as const;
  const values = new Map<keyof typeof labels, number>();
  for (const account of accounts) {
    if (isLiability(account)) continue;
    const key = Object.prototype.hasOwnProperty.call(labels, account.assetClass)
      ? (account.assetClass as keyof typeof labels)
      : "other";
    values.set(key, (values.get(key) ?? 0) + account.currentBalance);
  }
  return toSlices(
    [...values].map(([key, value]) => ({ key, label: labels[key], value })),
  );
}
