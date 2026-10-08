-- Torre de Control. Schema propio. Sin FKs hacia tablas operativas de Mostrador.
-- Reversible: drop schema if exists torre cascade;

create schema if not exists torre;

create table if not exists torre.saas_access (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into torre.saas_access (email)
values ('calssonclaudio@gmail.com')
on conflict (email) do nothing;

create table if not exists torre.saas_apps (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  repository_url text,
  production_url text,
  current_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_clients (
  id text primary key,
  name text not null,
  business_name text not null default '',
  contact_name text not null default '',
  phone text,
  email text,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  monthly_price numeric(12, 2) not null default 0,
  setup_price numeric(12, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_tenants (
  id text primary key,
  app_id text not null references torre.saas_apps (id),
  client_id text not null references torre.saas_clients (id),
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  plan_id text references torre.saas_plans (id),
  installed_version text,
  operational_tenant_ref text,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug)
);

create table if not exists torre.saas_subscriptions (
  id text primary key,
  client_id text not null references torre.saas_clients (id),
  tenant_id text not null references torre.saas_tenants (id),
  plan_id text not null references torre.saas_plans (id),
  monthly_price numeric(12, 2) not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  start_date date not null,
  next_payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.saas_payments (
  id text primary key,
  client_id text not null references torre.saas_clients (id),
  subscription_id text references torre.saas_subscriptions (id),
  amount numeric(12, 2) not null,
  payment_date date not null,
  concept text not null,
  status text not null default 'paid' check (status in ('pending', 'paid', 'void')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists torre.saas_expenses (
  id text primary key,
  app_id text references torre.saas_apps (id),
  concept text not null,
  provider text not null default '',
  amount numeric(12, 2) not null,
  frequency text not null default 'once' check (frequency in ('once', 'monthly', 'yearly')),
  category text not null default 'other' check (category in ('hosting', 'database', 'domain', 'ai', 'tools', 'api', 'other')),
  expense_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists torre.saas_versions (
  id text primary key,
  app_id text not null references torre.saas_apps (id),
  version text not null,
  platform text not null check (platform in ('web', 'android', 'windows')),
  release_date date not null,
  changelog text not null default '',
  download_url text,
  status text not null default 'published' check (status in ('draft', 'published', 'yanked')),
  created_at timestamptz not null default now()
);

create table if not exists torre.saas_deployments (
  id text primary key,
  app_id text not null references torre.saas_apps (id),
  tenant_id text references torre.saas_tenants (id),
  version_id text not null references torre.saas_versions (id),
  platform text not null check (platform in ('web', 'android', 'windows')),
  status text not null check (status in ('pending', 'deployed', 'failed', 'rolled_back')),
  deployed_at timestamptz,
  notes text not null default ''
);

insert into torre.saas_apps (
  id, name, slug, description, status, production_url, current_version
) values (
  'app_mostrador', 'Mostrador', 'mostrador',
  'Puesto del Mercado Central.', 'active', 'https://mostrador.grok.me', '1.0.5'
) on conflict (id) do nothing;

insert into torre.saas_clients (
  id, name, business_name, contact_name, status
) values (
  'cli_roman', 'Frutas Román', 'Frutas Román, el Jujeño', 'Román Quispe', 'active'
) on conflict (id) do nothing;

insert into torre.saas_plans (id, name, description, monthly_price, setup_price, status)
values ('plan_base', 'Base', 'Abono mensual del puesto.', 45000, 0, 'active')
on conflict (id) do nothing;

insert into torre.saas_tenants (
  id, app_id, client_id, name, slug, status, plan_id, installed_version, operational_tenant_ref, last_activity_at
) values
  ('ten_roman', 'app_mostrador', 'cli_roman', 'Frutas Román', 'frutas-roman', 'active', 'plan_base', '1.0.5', 'frutas-roman', now()),
  ('ten_puesto03', 'app_mostrador', 'cli_roman', 'Puesto 03', 'puesto-03', 'active', 'plan_base', '1.0.4', null, now() - interval '12 days')
on conflict (id) do nothing;

insert into torre.saas_subscriptions (
  id, client_id, tenant_id, plan_id, monthly_price, status, start_date, next_payment_date
) values (
  'sub_roman', 'cli_roman', 'ten_roman', 'plan_base', 45000, 'active', current_date - 40, current_date + 20
) on conflict (id) do nothing;

insert into torre.saas_payments (
  id, client_id, subscription_id, amount, payment_date, concept, status
) values (
  'pay_roman', 'cli_roman', 'sub_roman', 45000, current_date, 'Abono Mostrador', 'paid'
) on conflict (id) do nothing;

insert into torre.saas_expenses (
  id, app_id, concept, provider, amount, frequency, category, expense_date
) values
  ('exp_neon', 'app_mostrador', 'Base Postgres', 'Neon', 15000, 'monthly', 'database', current_date),
  ('exp_dom', 'app_mostrador', 'Dominio', 'Registro', 8000, 'yearly', 'domain', current_date)
on conflict (id) do nothing;

insert into torre.saas_versions (
  id, app_id, version, platform, release_date, changelog, status
) values
  ('ver_104', 'app_mostrador', '1.0.4', 'web', current_date - 20, 'Caja y remitos.', 'published'),
  ('ver_105', 'app_mostrador', '1.0.5', 'web', current_date - 2, 'Clientes del puesto y login limpio.', 'published')
on conflict (id) do nothing;

insert into torre.saas_deployments (
  id, app_id, tenant_id, version_id, platform, status, deployed_at, notes
) values
  ('dep_ok', 'app_mostrador', 'ten_roman', 'ver_105', 'web', 'deployed', now() - interval '2 days', 'Publicación web.'),
  ('dep_fail', 'app_mostrador', 'ten_puesto03', 'ver_105', 'web', 'failed', now() - interval '1 day', 'Quedó en la versión anterior.')
on conflict (id) do nothing;
