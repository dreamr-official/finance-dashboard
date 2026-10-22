import type { FinanceProvider } from "./types";
import { plaidProvider } from "./plaid";

const providers: Record<string, FinanceProvider> = {
  plaid: plaidProvider,
};

export function getProvider(id: string): FinanceProvider | undefined {
  return providers[id];
}

export function listProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, configured: p.configured }));
}
