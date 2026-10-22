alter table connections add column if not exists notice text;
alter table balance_snapshots
  add column if not exists source text not null default 'recorded';

create or replace view public.connection_notices as
select id, notice
from public.connections
where is_authorized();

grant select on public.connection_notices to authenticated;
