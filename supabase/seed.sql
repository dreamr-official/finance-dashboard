-- Run AFTER 0001_init.sql and after creating the three auth users.
-- Creates the allowlist rows. Adjust emails before running.
insert into authorized_users (user_id, email, role)
select id, email, 'admin' from auth.users where email = 'you@example.com'
on conflict (user_id) do update set role = 'admin';

insert into authorized_users (user_id, email, role)
select id, email, 'viewer' from auth.users where email in ('dad@example.com', 'mom@example.com')
on conflict (user_id) do update set role = 'viewer';

-- Configurable Roth limits by tax year.
insert into app_settings (key, value) values
  ('roth_limits', '{"2024":7000,"2025":7000,"2026":7500}')
on conflict (key) do nothing;
