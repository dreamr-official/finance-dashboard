# Finance Dashboard

Private personal finance dashboard — net worth, investment contributions,
and subscriptions. Three allowlisted users (1 admin, 2 read-only viewers).
Inspired by Origin / Rocket Money / Monarch.

## Quick start (demo mode)

```bash
npm install
npm run dev
```

No env vars needed — the app runs on seeded demo data at
http://localhost:3000 (clearly labeled in the UI). To go live, see
[docs/SETUP.md](docs/SETUP.md).

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Recharts ·
Supabase (Auth + Postgres + RLS) · Plaid / SnapTrade (Phase 2) · Vercel

## Structure

- `src/app/(app)/*` — Overview / Investments / Subscriptions / Accounts / Settings
- `src/app/api/*` — admin-gated mutation + integration + cron routes
- `src/lib/finance.ts` — net worth, contribution, transfer, Roth math
- `src/lib/data/` — provider-swappable data layer (demo ↔ Supabase)
- `src/lib/integrations/` — Plaid / SnapTrade adapter interfaces
- `supabase/migrations/` — schema + RLS policies

## Accounting rules

- Net worth = assets − liabilities.
- Only `deposit`/`withdrawal` transactions count as contributions; buys,
  sells, dividends, and paired transfers between your own accounts never do.
- Return % is shown only when contribution history exists; otherwise the UI
  says so rather than implying a number.
- Predicted vs verified subscription renewal dates are distinguished.
