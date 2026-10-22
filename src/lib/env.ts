export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** True when running on seeded demo data (no Supabase). */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true" || !isSupabaseConfigured();
}
