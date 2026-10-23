# Setup & Deployment Guide

The app runs in **demo mode** (seeded sample data, no auth) until Supabase is
configured. Everything below is done in the services' own dashboards — no
secrets ever go in the repo, chat, or git.

## 1. Supabase

1. Create a project at https://supabase.com (free tier is fine for 3 users).
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`,
   `supabase/migrations/0002_connection_tokens.sql`, and
   `supabase/migrations/0003_plaid_sync.sql`, and
   `supabase/migrations/0004_realtime_push.sql`, and
   `supabase/migrations/0005_investments_history.sql`,
   `supabase/migrations/0006_tax_year.sql`, then `supabase/seed.sql`
   (edit the emails first). Migration 0004 enables Realtime refreshes and
   creates the RLS-protected push subscription table.
   Migration 0006 adds:
   `alter table transactions add column if not exists tax_year smallint check (tax_year between 2000 and 2100);`
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

Manual entry is the primary workflow; Plaid linking is optional and read-only.

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

## 3. Plaid (optional — bank account linking)

Manual entry works fully without this. Plaid syncs account balances and
transactions but does not initiate payments or modify accounts at the bank.

1. Sign up at https://dashboard.plaid.com. Get `client_id` and `secret` from
   Keys. Add `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, and a
   `TOKEN_ENCRYPTION_KEY` to Vercel's server-side environment variables.
2. Redeploy after setting the variables.
3. As an admin, open **Accounts → Connect bank** and finish Plaid Link. The
   app exchanges and encrypts the access token, then performs an initial sync.
   The token is not returned to the browser.
4. Use **Sync now** on Accounts for an on-demand refresh. The daily
   `/api/cron/daily-snapshot` job syncs Plaid connections before recording
   balance snapshots.
5. If investment data is not enabled for an existing Item, open
   **Settings → Plaid connections → Grant investment access** and complete
   Plaid Link update mode. Then sync again. Investments availability depends
   on your Plaid plan and institution; unsupported Items continue syncing
   account balances and Transactions without investment data.
6. Production access requires Plaid approval. Sandbox can be used for setup
   testing, but never enter real financial credentials in the repository.

## 4. Notifications

Web Push and the PWA install experience use free browser and VAPID support.
Generate keys with `npx web-push generate-vapid-keys`, then set
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
(a `mailto:` address) in Vercel and redeploy. Never commit VAPID keys.
After signing in, open **Settings → Notifications** to enable each device and
send a test. On iPhone, add Finance to the Home Screen first; web push requires
iOS 16.4 or later.

## 5. Vercel

1. Import the repo (keep it **private**). Framework preset: Next.js.
2. Add the env vars from `.env.example` (Production scope; also Preview if
   you want preview deploys — but note preview deployments share the same
   auth gate, which is what you want).
3. `vercel.json` registers a daily cron (`/api/cron/daily-snapshot`,
   08:00 UTC) for balance snapshots. Set `CRON_SECRET` to any random string.

## Security notes

- All mutating API routes call `requireAdmin()`; read routes require a
  session AND an `authorized_users` row — enforced again by Postgres RLS.
- Plaid is optional; access tokens are encrypted server-side and the integration
  only reads account and transaction data. No payments are initiated.
