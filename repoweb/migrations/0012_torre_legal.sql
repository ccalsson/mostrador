-- Contratos, promociones y roles. Solo schema torre.
-- No hay FK hacia tablas operativas de Mostrador ni de Mercado al Toque.
-- No pisa precios ya cargados.

alter table torre.saas_access add column if not exists role text not null default 'administracion';

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'torre' and rel.relname = 'saas_access' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table torre.saas_access drop constraint %I', r.conname);
  end loop;
end $$;

alter table torre.saas_access drop constraint if exists saas_access_role_check;
alter table torre.saas_access
  add constraint saas_access_role_check
  check (role in ('administracion', 'comercial', 'legal', 'soporte', 'auditoria'));

alter table torre.saas_plans add column if not exists code text;
alter table torre.saas_plans add column if not exists currency text not null default 'ARS';
alter table torre.saas_plans add column if not exists periodicity text not null default 'monthly';
alter table torre.saas_plans add column if not exists features jsonb not null default '[]'::jsonb;
alter table torre.saas_plans add column if not exists limits jsonb not null default '{}'::jsonb;
alter table torre.saas_plans add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table torre.saas_plans add column if not exists valid_from date;
alter table torre.saas_plans add column if not exists valid_to date;

update torre.saas_plans
set code = 'plan-base'
where id = 'plan_base' and (code is null or code = '');

create unique index if not exists saas_plans_code_idx on torre.saas_plans (code) where code is not null;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'torre' and rel.relname = 'saas_subscriptions' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table torre.saas_subscriptions drop constraint %I', r.conname);
  end loop;
end $$;

alter table torre.saas_subscriptions drop constraint if exists saas_subscriptions_status_check;
alter table torre.saas_subscriptions
  add constraint saas_subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'paused', 'suspended', 'cancelled'));

create table if not exists torre.saas_promotions (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_promotion_grants (
  id text primary key,
  promotion_id text not null references torre.saas_promotions (id),
  tenant_id text not null references torre.saas_tenants (id),
  status text not null default 'active' check (status in ('active', 'ended', 'revoked')),
  starts_on date not null,
  ends_on date,
  conditions text not null default '',
  evidence_ref text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists saas_grants_tenant_idx on torre.saas_promotion_grants (tenant_id, status);

insert into torre.saas_promotions (id, code, name, description, status, config)
values (
  'promo_fundador',
  'fundador-mercado',
  'Fundador Mercado al Toque',
  'Plantilla. No aplica a ningún tenant hasta que Torre la asigne. Borrador comercial, no es un contrato.',
  'draft',
  '{"bonusMonths":6,"commissionPercent":0,"frozenMonths":12,"productSlugs":["mercado-presencia","mercado-pro"],"conditions":"Testimonio, uso de datos y permiso de referencia comercial. Pendiente de redacción jurídica."}'::jsonb
)
on conflict (id) do nothing;

create table if not exists torre.saas_legal_documents (
  id text primary key,
  code text not null unique,
  title text not null,
  audience text not null check (audience in ('saas_b2b', 'mercado_comprador', 'mercado_cargador', 'privacy', 'other')),
  reaccept_on_change boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_legal_versions (
  id text primary key,
  document_id text not null references torre.saas_legal_documents (id),
  version_label text not null,
  body text not null,
  content_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, version_label)
);

create index if not exists saas_legal_versions_doc_idx on torre.saas_legal_versions (document_id, status);

create table if not exists torre.saas_tenant_contracts (
  id text primary key,
  tenant_id text not null references torre.saas_tenants (id),
  document_id text not null references torre.saas_legal_documents (id),
  version_id text not null references torre.saas_legal_versions (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'superseded', 'cancelled')),
  snapshot_body text not null,
  snapshot_hash text not null,
  offered_at timestamptz not null default now()
);

create index if not exists saas_contracts_tenant_idx on torre.saas_tenant_contracts (tenant_id, status);

create table if not exists torre.saas_contract_acceptances (
  id text primary key,
  contract_id text references torre.saas_tenant_contracts (id),
  version_id text not null references torre.saas_legal_versions (id),
  tenant_id text references torre.saas_tenants (id),
  user_id text not null,
  user_email text not null default '',
  snapshot_hash text not null,
  accepted_at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  action text not null default 'electronic_acceptance'
);

create index if not exists saas_acceptances_tenant_idx on torre.saas_contract_acceptances (tenant_id, accepted_at desc);
create index if not exists saas_acceptances_user_idx on torre.saas_contract_acceptances (user_id, version_id);

create table if not exists torre.saas_processors (
  id text primary key,
  name text not null,
  category text not null,
  purpose text not null default '',
  legal_role_note text not null default 'Pendiente de revisión jurídica. No clasifica responsable ni encargado.',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

insert into torre.saas_processors (id, name, category, purpose)
values
  ('proc_neon', 'Neon', 'database', 'PostgreSQL de producción cuando hay DATABASE_URL.'),
  ('proc_vercel', 'Vercel', 'hosting', 'Hosting del backend web cuando el proyecto se publica ahí.')
on conflict (id) do nothing;

insert into torre.saas_legal_documents (id, code, title, audience, reaccept_on_change, status)
values
  ('doc_saas', 'mostrador-saas', 'Relación comercial del puesto', 'saas_b2b', true, 'draft'),
  ('doc_comprador', 'mercado-comprador', 'Términos del comprador', 'mercado_comprador', true, 'draft'),
  ('doc_cargador', 'mercado-cargador', 'Términos del cargador', 'mercado_cargador', true, 'draft'),
  ('doc_privacidad', 'privacidad', 'Privacidad', 'privacy', true, 'draft')
on conflict (id) do nothing;
