create table if not exists torre.saas_medios_pago (
  id text primary key,
  alias text not null default '',
  cbu text not null default '',
  updated_at timestamptz not null default now()
);

insert into torre.saas_medios_pago (id, alias, cbu)
values ('transferencia', '', '')
on conflict (id) do nothing;
