import type { FinanceProvider } from "./types";
import { plaidProvider } from "./plaid";
import { snaptradeProvider } from "./snaptrade";

const providers: Record<string, FinanceProvider> = {
  plaid: plaidProvider,
  snaptrade: snaptradeProvider,
};

export function getProvider(id: string): FinanceProvider | undefined {
  return providers[id];
}

export function listProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, configured: p.configured }));
}
