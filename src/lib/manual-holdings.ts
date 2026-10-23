import { z } from "zod";
import type { Account, Holding } from "./types";

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
