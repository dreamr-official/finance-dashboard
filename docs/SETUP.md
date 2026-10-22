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

## 2. Plaid (Phase 2 — banks)

1. Sign up at https://dashboard.plaid.com — **sandbox** is free.
2. Get `client_id` + `secret` from Keys. Set `PLAID_CLIENT_ID`,
   `PLAID_SECRET`, `PLAID_ENV=sandbox`.
3. The connect flow: `POST /api/integrations/plaid/link-token` → open Plaid
   Link → `POST /api/integrations/plaid/exchange`. Production access requires
   Plaid approval; sandbox works immediately.

## 3. SnapTrade (Phase 2 — brokerages)

1. Register at https://snaptrade.com for `clientId` + `consumerKey` (free
   tier exists). Set `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`.
2. Covers Fidelity/Robinhood-style brokerage connections Plaid doesn't reach.
3. `src/lib/integrations/snaptrade.ts` has the wiring points marked.

## 4. Vercel

1. Import the repo (keep it **private**). Framework preset: Next.js.
2. Add the env vars from `.env.example` (Production scope; also Preview if
   you want preview deploys — but note preview deployments share the same
   auth gate, which is what you want).
3. `vercel.json` registers a daily cron (`/api/cron/daily-snapshot`,
   08:00 UTC) for balance snapshots. Set `CRON_SECRET` to any random string.

## Security notes

- All mutating API routes call `requireAdmin()`; read routes require a
  session AND an `authorized_users` row — enforced again by Postgres RLS.
- Provider tokens are stored encrypted (`connections.encrypted_token`),
  never returned to the browser.
- Read-only API access only — the app cannot move money.
