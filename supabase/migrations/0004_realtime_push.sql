create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions self" on public.push_subscriptions;
create policy "push subscriptions self"
  on public.push_subscriptions
  for all
  using (user_id = auth.uid() and is_authorized())
  with check (user_id = auth.uid() and is_authorized());

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'transactions',
    'subscriptions',
    'holdings',
    'balance_snapshots'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
