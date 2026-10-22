import { isDemoMode } from "../env";
import { demoDataset } from "../demo-data";
import type { Dataset } from "./types";

export type { Dataset };

/**
 * Data access layer. When Supabase is not configured the app serves the
 * seeded demo dataset (clearly labeled in the UI). Once env vars are set,
 * swap in SupabaseProvider — same interface.
 */
export async function getDataset(): Promise<Dataset> {
  if (isDemoMode()) return demoDataset;
  const { fetchDataset } = await import("./supabase-provider");
  return fetchDataset();
}
