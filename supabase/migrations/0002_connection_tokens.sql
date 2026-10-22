create extension if not exists pgcrypto;


-- Upserts a connection, encrypting the provider access token with the
-- server-held TOKEN_ENCRYPTION_KEY. Only callable via the service role;
-- tokens are never readable by clients (connections has admin-all RLS).
create or replace function upsert_connection(
  p_institution_id uuid,
  p_provider provider_kind,
  p_provider_item_id text,
  p_token text,
  p_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into connections (institution_id, provider, provider_item_id, encrypted_token)
  values (
    p_institution_id, p_provider, p_provider_item_id,
    pgp_sym_encrypt(p_token, p_key)
  )
  on conflict (provider, provider_item_id)
  do update set
    encrypted_token = pgp_sym_encrypt(p_token, p_key),
    status = 'healthy',
    last_error = null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function upsert_connection(uuid, provider_kind, text, text, text) from public, anon, authenticated;
grant execute on function upsert_connection(uuid, provider_kind, text, text, text) to service_role;

-- Decrypt a connection's token server-side (sync worker only).
create or replace function decrypt_connection_token(
  p_connection_id uuid,
  p_key text
) returns text
language sql security definer set search_path = public as $$
  select pgp_sym_decrypt(encrypted_token, p_key)
  from connections where id = p_connection_id;
$$;

revoke all on function decrypt_connection_token(uuid, text) from public, anon, authenticated;
grant execute on function decrypt_connection_token(uuid, text) to service_role;
