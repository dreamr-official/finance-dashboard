# Setup & Deployment Guide

The app runs in **demo mode** (seeded sample data, no auth) until Supabase is
configured. Everything below is done in the services' own dashboards — no
secrets ever go in the repo, chat, or git.

## 1. Supabase

1. Create a project at https://supabase.com (free tier is fine for 3 users).
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then
   `supabase/seed.sql` (edit the emails first).
3. In **Authentication → Users → Add user**, create the three accounts
   (admin + two viewers). Then re-run the two `insert` statements in
   `seed.sql` so the allowlist rows attach to the real user IDs.
4. **MFA:** Authentication → Sign In / Providers → enable **TOTP**. Each user
   enrolls an authenticator at first login.
5. Disable public signup: Authentication → Sign In / Providers → Email →
   turn **off** "Allow new users to sign up". Even with credentials, the
   `authorized_users` allowlist + RLS blocks anyone not listed.
6. Copy **Project URL** and **anon key** into Vercel env vars, plus the
   **service-role key** for the cron job (server-only).

## 2. Entering data

Everything is manual — no bank connections.

- **Accounts page → Add account**: name, institution, type, and the current
  balance. Do this once per account (checking, savings, Roth, 401k…).
- **Account detail → Add transaction**: record deposits/withdrawals,
  transfers between your own accounts, buys, dividends, etc. Use
  "deposit" only for money coming in from outside — moving money between
  your own accounts is a "transfer", so contributions stay accurate.
- **Account detail → CSV**: bulk-import history exported from a bank
  (`date,name,amount[,type]` columns). Re-importing is safe — duplicates
  are skipped.
- **Subscriptions page → Add**: name, cost, frequency, next payment date,
  and optionally which account it's charged to. Edit or cancel from the
  row actions.
- Viewers can see everything but can't change anything.

## 3. Vercel

1. Import the repo (keep it **private**). Framework preset: Next.js.
2. Add the env vars from `.env.example` (Production scope; also Preview if
   you want preview deploys — but note preview deployments share the same
   auth gate, which is what you want).
3. `vercel.json` registers a daily cron (`/api/cron/daily-snapshot`,
   08:00 UTC) for balance snapshots. Set `CRON_SECRET` to any random string.

## Security notes

- All mutating API routes call `requireAdmin()`; read routes require a
  session AND an `authorized_users` row — enforced again by Postgres RLS.
- No third-party financial connections — nothing leaves your database.
