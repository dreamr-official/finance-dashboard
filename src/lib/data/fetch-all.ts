export async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
