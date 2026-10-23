import type { Account, Holding } from "./types";
import { isLiability } from "./finance";

export {
  HOLDING_ASSET_TYPES,
  canManageHoldings,
  holdingCreateSchema,
  holdingPatchSchema,
  holdingsBalanceGap,
  toHoldingInsert,
  toHoldingUpdate,
} from "./manual-holdings";
export type { HoldingCreateInput, HoldingPatchInput, HoldingRow } from "./manual-holdings";

export interface Slice {
  key: string;
  label: string;
  value: number;
  pct: number;
  sources?: SliceSource[];
}

export interface SliceSource {
  label: string;
  value: number;
}

function sortedPositiveSources(sources: SliceSource[]): SliceSource[] {
  return sources
    .filter((source) => Number.isFinite(source.value) && source.value > 0)
    .sort((a, b) => b.value - a.value);
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

export function toSlices(
  items: { key: string; label: string; value: number; sources?: SliceSource[] }[],
): Slice[] {
  const kept = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = kept.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return [];
  return kept.map((item) => ({
    ...item,
    ...(item.sources === undefined
      ? {}
      : { sources: sortedPositiveSources(item.sources) }),
    pct: (item.value / total) * 100,
  }));
}

export function capSlices(slices: Slice[], max = 6): Slice[] {
  if (slices.length <= max) return slices;
  const kept = slices.slice(0, max - 1);
  const rest = slices.slice(max - 1);
  const value = rest.reduce((sum, slice) => sum + slice.value, 0);
  const pct = rest.reduce((sum, slice) => sum + slice.pct, 0);
  return [
    ...kept,
    {
      key: "__other",
      label: "Other",
      value,
      pct,
      sources: sortedPositiveSources(
        rest.map((slice) => ({ label: slice.label, value: slice.value })),
      ),
    },
  ];
}

export interface SymbolGroup extends Slice {
  symbol: string;
  name: string;
  quantity: number;
  costBasis?: number;
  accountIds: string[];
  assetType: Holding["assetType"];
}

export function groupHoldingsBySymbol(
  holdings: Holding[],
  accountNames?: Map<string, string>,
): SymbolGroup[] {
  const groups = new Map<string, SymbolGroup>();
  const sourceValuesBySymbol = accountNames
    ? new Map<string, Map<string, number>>()
    : undefined;
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
    if (sourceValuesBySymbol) {
      const sourceValues = sourceValuesBySymbol.get(symbol) ?? new Map<string, number>();
      sourceValues.set(
        holding.accountId,
        (sourceValues.get(holding.accountId) ?? 0) + holding.value,
      );
      sourceValuesBySymbol.set(symbol, sourceValues);
    }
  }
  const collected = [...groups.values()];
  const slices = toSlices(collected);
  const bySymbol = new Map(collected.map((group) => [group.key, group]));
  return slices.map((slice) => {
    const group = bySymbol.get(slice.key)!;
    const sources = sourceValuesBySymbol?.get(group.symbol);
    return {
      ...group,
      ...(accountNames
        ? {
            sources: sortedPositiveSources(
              [...(sources ?? [])].map(([accountId, value]) => ({
                label: accountNames.get(accountId) ?? "Unknown account",
                value,
              })),
            ),
          }
        : {}),
      pct: slice.pct,
    };
  });
}

export function groupHoldingsByAssetType(holdings: Holding[]): Slice[] {
  const values = new Map<Holding["assetType"], number>();
  const sourceValues = new Map<Holding["assetType"], Map<string, number>>();
  for (const holding of holdings) {
    values.set(holding.assetType, (values.get(holding.assetType) ?? 0) + holding.value);
    const symbol = holding.symbol.trim().toUpperCase();
    const symbols = sourceValues.get(holding.assetType) ?? new Map<string, number>();
    symbols.set(symbol, (symbols.get(symbol) ?? 0) + holding.value);
    sourceValues.set(holding.assetType, symbols);
  }
  return toSlices(
    [...values].map(([assetType, value]) => ({
      key: assetType,
      label: ASSET_TYPE_LABEL[assetType],
      value,
      sources: [...(sourceValues.get(assetType) ?? [])].map(([label, sourceValue]) => ({
        label,
        value: sourceValue,
      })),
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
  const sources = new Map<keyof typeof labels, SliceSource[]>();
  for (const account of accounts) {
    if (isLiability(account)) continue;
    const key = Object.prototype.hasOwnProperty.call(labels, account.assetClass)
      ? (account.assetClass as keyof typeof labels)
      : "other";
    values.set(key, (values.get(key) ?? 0) + account.currentBalance);
    if (
      account.assetClass !== "liability" &&
      Number.isFinite(account.currentBalance) &&
      account.currentBalance > 0
    ) {
      const classSources = sources.get(key) ?? [];
      classSources.push({ label: account.name, value: account.currentBalance });
      sources.set(key, classSources);
    }
  }
  return toSlices(
    [...values].map(([key, value]) => ({
      key,
      label: labels[key],
      value,
      sources: sources.get(key) ?? [],
    })),
  );
}
