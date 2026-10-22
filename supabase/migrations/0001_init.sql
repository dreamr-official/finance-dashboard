-- Personal finance dashboard schema.
-- Three allowlisted users: one admin, two viewers. No public signup.

create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'viewer');
create type provider_kind as enum ('plaid', 'snaptrade', 'manual');
create type account_type as enum (
  'checking','savings','brokerage','roth_ira','traditional_ira',
  '401k','credit_card','loan','cash','other'
);
create type asset_class as enum ('cash','investment','retirement','liability','other');
create type connection_status as enum ('healthy','needs_reauth','error','manual');
create type txn_type as enum (
  'deposit','withdrawal','transfer_in','transfer_out','buy','sell',
  'dividend','interest','fee','expense','income','other'
);
create type billing_frequency as enum ('weekly','monthly','quarterly','annual');
create type subscription_status as enum ('active','canceled','uncertain');
create type holding_asset_type as enum ('stock','etf','mutual_fund','cash','bond','crypto','other');
create type sync_status as enum ('queued','running','succeeded','failed');

-- ---------------------------------------------------------------------------
-- Allowlist. Profiles are keyed to auth.users; role set at insert time by the
-- admin (seeded via the service role — see docs/SETUP.md).
create table authorized_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from authorized_users
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_authorized() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from authorized_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
create table institutions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  provider   provider_kind not null,
  logo_url   text,
  created_at timestamptz not null default now()
);

-- Third-party connection state. Access tokens are stored encrypted via
-- pgsodium/vault in production; never exposed to the client.
create table connections (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid references institutions (id) on delete set null,
  provider           provider_kind not null,
  provider_item_id   text,                -- e.g. Plaid item_id / SnapTrade connection id
  encrypted_token    bytea,               -- ciphertext only; decrypt server-side
  status             connection_status not null default 'healthy',
  last_synced_at     timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  unique (provider, provider_item_id)
);

create table accounts (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid references institutions (id) on delete set null,
  connection_id     uuid references connections (id) on delete set null,
  provider_acct_id  text,
  name              text not null,
  type              account_type not null,
  asset_class       asset_class not null,
  mask              text,
  currency          text not null default 'USD',
  current_balance   numeric(14,2) not null default 0,
  is_manual         boolean not null default false,
  connection_status connection_status not null default 'manual',
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  unique (connection_id, provider_acct_id)
);
create index accounts_institution_idx on accounts (institution_id);

create table balance_snapshots (
  account_id uuid not null references accounts (id) on delete cascade,
  date       date not null,
  balance    numeric(14,2) not null,
  primary key (account_id, date)
);
create index balance_snapshots_date_idx on balance_snapshots (date);

create table transactions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts (id) on delete cascade,
  provider_txn_id   text,
  date              date not null,
  name              text not null,
  amount            numeric(14,2) not null,   -- signed: + in, - out
  type              txn_type not null default 'other',
  transfer_pair_id  uuid,
  category          text,
  pending           boolean not null default false,
  type_overridden   boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (account_id, provider_txn_id)
);
create index transactions_account_date_idx on transactions (account_id, date desc);
create index transactions_type_idx on transactions (type);

create table holdings (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts (id) on delete cascade,
  symbol       text not null,
  name         text not null,
  quantity     numeric(20,6) not null,
  price        numeric(14,4) not null,
  value        numeric(14,2) not null,
  cost_basis   numeric(14,2),
  asset_type   holding_asset_type not null default 'other',
  as_of        timestamptz not null default now(),
  unique (account_id, symbol)
);

create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  logo_url            text,
  amount              numeric(10,2) not null,
  frequency           billing_frequency not null,
  next_expected_date  date,
  date_verified       boolean not null default false,
  account_id          uuid references accounts (id) on delete set null,
  status              subscription_status not null default 'active',
  detected            boolean not null default false,
  remind_days_before  int,
  created_at          timestamptz not null default now()
);

create table sync_jobs (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid references connections (id) on delete cascade,
  status        sync_status not null default 'queued',
  started_at    timestamptz,
  finished_at   timestamptz,
  error         text,
  stats         jsonb,
  created_at    timestamptz not null default now()
);

create table app_settings (
  key   text primary key,
  value jsonb not null
);
-- e.g. {'key':'roth_limits','value':{"2026":7500}}

-- ---------------------------------------------------------------------------
-- Row Level Security: allowlisted users read everything; only admins write.
alter table authorized_users    enable row level security;
alter table institutions        enable row level security;
alter table connections         enable row level security;
alter table accounts            enable row level security;
alter table balance_snapshots   enable row level security;
alter table transactions        enable row level security;
alter table holdings            enable row level security;
alter table subscriptions       enable row level security;
alter table sync_jobs           enable row level security;
alter table app_settings        enable row level security;

create policy "allowlist read"  on authorized_users  for select using (is_authorized());
create policy "admin write"     on authorized_users  for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on institutions      for select using (is_authorized());
create policy "admin write"     on institutions      for all    using (is_admin()) with check (is_admin());

-- Connections contain tokens: readers see metadata only via a view.
create policy "admin all"       on connections       for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on accounts          for select using (is_authorized());
create policy "admin write"     on accounts          for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on balance_snapshots for select using (is_authorized());
create policy "admin write"     on balance_snapshots for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on transactions      for select using (is_authorized());
create policy "admin write"     on transactions      for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on holdings          for select using (is_authorized());
create policy "admin write"     on holdings          for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on subscriptions     for select using (is_authorized());
create policy "admin write"     on subscriptions     for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on sync_jobs         for select using (is_authorized());
create policy "admin write"     on sync_jobs         for all    using (is_admin()) with check (is_admin());

create policy "allowlist read"  on app_settings      for select using (is_authorized());
create policy "admin write"     on app_settings      for all    using (is_admin()) with check (is_admin());
