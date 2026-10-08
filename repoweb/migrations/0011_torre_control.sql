-- Control comercial y de releases. Solo schema torre.
-- No hay FK hacia tablas operativas de Mostrador ni de Mercado al Toque.

create table if not exists torre.saas_fx_rates (
  id text primary key,
  source text not null,
  as_of date not null,
  usd_ars numeric(14, 4) not null check (usd_ars > 0),
  created_at timestamptz not null default now()
);

insert into torre.saas_fx_rates (id, source, as_of, usd_ars)
values (
  'fx_bna_20261007',
  'dólar oficial vendedor Banco Nación',
  date '2026-10-07',
  1540
)
on conflict (id) do nothing;

insert into torre.saas_apps (id, name, slug, description, status)
values (
  'app_mercado',
  'Mercado al Toque',
  'mercado-al-toque',
  'Marketplace. Torre solo administra la contratación. La operación queda en la app.',
  'active'
)
on conflict (id) do nothing;

create table if not exists torre.saas_products (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  kind text not null check (kind in (
    'base_product', 'addon', 'branch', 'subscription', 'advertising', 'messaging', 'commission', 'free'
  )),
  app_id text references torre.saas_apps (id),
  billing text not null check (billing in ('once', 'recurring', 'commission', 'free')),
  frequency text not null check (frequency in ('once', 'monthly', 'yearly')),
  setup_usd numeric(12, 2),
  setup_ars numeric(12, 2),
  recurring_usd numeric(12, 2),
  recurring_ars numeric(12, 2),
  once_usd numeric(12, 2),
  once_ars numeric(12, 2),
  unit_label text not null default '',
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into torre.saas_products (
  id, name, slug, description, kind, app_id, billing, frequency,
  setup_usd, recurring_usd, once_usd, unit_label, config
) values
  (
    'prod_base', 'Mostrador Base', 'mostrador-base',
    'Dueño, cajero, vendedor, stock, caja, reportes, auditoría y 1 sucursal.',
    'base_product', 'app_mostrador', 'recurring', 'monthly',
    975, 100, null, 'puesto', '{"includedBranches":1,"family":"mostrador"}'::jsonb
  ),
  (
    'prod_sucursal', 'Sucursal extra', 'sucursal-extra',
    'Otra sucursal del mismo tenant. La primera no se factura.',
    'branch', 'app_mostrador', 'recurring', 'monthly',
    null, 25, null, 'sucursal', '{"billedAs":"extra_branch","family":"mostrador"}'::jsonb
  ),
  (
    'prod_presencia', 'Mercado al Toque Presencia', 'mercado-presencia',
    'Catálogo online, QR, pedidos, caja y asignación de cargadores.',
    'addon', 'app_mercado', 'recurring', 'monthly',
    null, 32, null, 'puesto', '{"family":"mercado","tier":"presencia"}'::jsonb
  ),
  (
    'prod_pro', 'Mercado al Toque Pro', 'mercado-pro',
    'Presencia más cuenta corriente, reportes, prioridad, 1 push y 1 banner rotativo al mes.',
    'addon', 'app_mercado', 'recurring', 'monthly',
    null, 65, null, 'puesto', '{"family":"mercado","tier":"pro","replaces":"mercado-presencia"}'::jsonb
  ),
  (
    'prod_push_10', 'Push 10.000', 'push-10000',
    'Pack de 10.000 envíos. Torre anota el cupo. El envío lo hace Mercado al Toque.',
    'messaging', 'app_mercado', 'once', 'once',
    null, null, 20, 'envíos', '{"sends":10000,"family":"messaging"}'::jsonb
  ),
  (
    'prod_push_50', 'Push 50.000', 'push-50000',
    'Pack de 50.000 envíos.',
    'messaging', 'app_mercado', 'once', 'once',
    null, null, 65, 'envíos', '{"sends":50000,"family":"messaging"}'::jsonb
  ),
  (
    'prod_banner_home', 'Banner home', 'banner-home',
    '7 días en la portada de Mercado al Toque.',
    'advertising', 'app_mercado', 'once', 'once',
    null, null, 50, '7 días', '{"days":7,"placement":"home","family":"ads"}'::jsonb
  ),
  (
    'prod_banner_cat', 'Banner categoría', 'banner-categoria',
    '7 días en una categoría.',
    'advertising', 'app_mercado', 'once', 'once',
    null, null, 25, '7 días', '{"days":7,"placement":"category","family":"ads"}'::jsonb
  ),
  (
    'prod_destacado', 'Destacado búsqueda', 'destacado-busqueda',
    '7 días destacado en búsqueda.',
    'advertising', 'app_mercado', 'once', 'once',
    null, null, 13, '7 días', '{"days":7,"placement":"search","family":"ads"}'::jsonb
  ),
  (
    'prod_cargador', 'Cargador', 'cargador',
    'Registro gratuito. Comisión por entrega. No es un abono.',
    'commission', 'app_mercado', 'commission', 'once',
    null, null, null, 'entrega', '{"percentMin":10,"percentMax":15,"family":"commission"}'::jsonb
  ),
  (
    'prod_comprador', 'Comprador', 'comprador',
    'Descarga y compra sin cargo.',
    'free', 'app_mercado', 'free', 'once',
    null, null, 0, 'cuenta', '{"family":"free"}'::jsonb
  )
on conflict (id) do nothing;

create table if not exists torre.saas_branches (
  id text primary key,
  tenant_id text not null references torre.saas_tenants (id),
  name text not null,
  slug text not null,
  address text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  included boolean not null default false,
  opened_on date not null default current_date,
  closed_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists saas_branches_tenant_idx on torre.saas_branches (tenant_id, status);

alter table torre.saas_subscriptions add column if not exists last_paid_on date;

create table if not exists torre.saas_subscription_lines (
  id text primary key,
  subscription_id text not null references torre.saas_subscriptions (id),
  product_id text not null references torre.saas_products (id),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null,
  currency text not null check (currency in ('USD', 'ARS')),
  frequency text not null check (frequency in ('once', 'monthly', 'yearly')),
  charge text not null default 'recurring' check (charge in ('recurring', 'setup')),
  subtotal numeric(12, 2) not null,
  starts_on date not null,
  ends_on date,
  next_due date,
  paid_through date,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'cancelled')),
  notes text not null default '',
  fx_rate_id text references torre.saas_fx_rates (id),
  fx_rate numeric(14, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_lines_sub_idx on torre.saas_subscription_lines (subscription_id, status);

create table if not exists torre.saas_ads (
  id text primary key,
  product_id text not null references torre.saas_products (id),
  tenant_id text not null references torre.saas_tenants (id),
  line_id text references torre.saas_subscription_lines (id),
  placement text not null,
  starts_on date not null,
  ends_on date not null,
  price numeric(12, 2) not null,
  currency text not null check (currency in ('USD', 'ARS')),
  status text not null default 'draft' check (status in (
    'draft', 'pending_payment', 'scheduled', 'active', 'expired', 'cancelled'
  )),
  content_ref text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_ads_tenant_idx on torre.saas_ads (tenant_id, status, ends_on);

create table if not exists torre.saas_message_packs (
  id text primary key,
  tenant_id text not null references torre.saas_tenants (id),
  product_id text not null references torre.saas_products (id),
  line_id text references torre.saas_subscription_lines (id),
  quantity integer not null check (quantity > 0),
  consumed integer not null default 0 check (consumed >= 0),
  purchased_on date not null,
  expires_on date,
  status text not null default 'active' check (status in ('active', 'exhausted', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  check (consumed <= quantity)
);

create table if not exists torre.saas_commission_policies (
  id text primary key,
  product_id text not null references torre.saas_products (id),
  percent_min numeric(5, 2) not null,
  percent_max numeric(5, 2) not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  check (percent_min >= 0 and percent_max >= percent_min and percent_max <= 100)
);

insert into torre.saas_commission_policies (id, product_id, percent_min, percent_max, effective_from, status)
values ('pol_cargador', 'prod_cargador', 10, 15, date '2026-10-07', 'active')
on conflict (id) do nothing;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'torre'
      and rel.relname = 'saas_versions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table torre.saas_versions drop constraint %I', r.conname);
  end loop;
end $$;

alter table torre.saas_versions add column if not exists checksum text;
alter table torre.saas_versions add column if not exists minimum_supported_version text;
alter table torre.saas_versions add column if not exists mandatory boolean not null default false;
alter table torre.saas_versions add column if not exists published_at timestamptz;
alter table torre.saas_versions add column if not exists channel text not null default 'production';

alter table torre.saas_versions drop constraint if exists saas_versions_status_check;
alter table torre.saas_versions
  add constraint saas_versions_status_check
  check (status in ('draft', 'ready', 'published', 'deprecated', 'yanked'));

create table if not exists torre.saas_release_targets (
  id text primary key,
  version_id text not null references torre.saas_versions (id),
  scope text not null check (scope in ('all', 'tenant', 'branch', 'beta')),
  tenant_id text references torre.saas_tenants (id),
  branch_id text references torre.saas_branches (id),
  status text not null default 'approved' check (status in ('pending', 'approved', 'deploying', 'deployed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists saas_release_targets_version_idx on torre.saas_release_targets (version_id);

alter table torre.saas_deployments add column if not exists infra_confirmed boolean not null default false;
alter table torre.saas_deployments add column if not exists external_id text;
alter table torre.saas_deployments add column if not exists external_url text;
alter table torre.saas_deployments add column if not exists log_excerpt text not null default '';
alter table torre.saas_deployments add column if not exists origin text not null default 'manual';

alter table torre.saas_payments add column if not exists tenant_id text references torre.saas_tenants (id);
alter table torre.saas_payments add column if not exists product_id text references torre.saas_products (id);
alter table torre.saas_payments add column if not exists line_id text references torre.saas_subscription_lines (id);
alter table torre.saas_payments add column if not exists kind text not null default 'otro';
alter table torre.saas_payments add column if not exists currency text not null default 'ARS';
alter table torre.saas_payments add column if not exists fx_rate numeric(14, 4);
alter table torre.saas_payments add column if not exists fx_rate_id text references torre.saas_fx_rates (id);

alter table torre.saas_payments drop constraint if exists saas_payments_kind_check;
alter table torre.saas_payments
  add constraint saas_payments_kind_check
  check (kind in ('instalacion', 'mensualidad', 'addon', 'sucursal', 'mercado', 'publicidad', 'push', 'otro'));

alter table torre.saas_payments drop constraint if exists saas_payments_currency_check;
alter table torre.saas_payments
  add constraint saas_payments_currency_check
  check (currency in ('USD', 'ARS'));

create table if not exists torre.saas_audit (
  id text primary key,
  actor_email text not null,
  action text not null,
  entity text not null,
  entity_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saas_audit_created_idx on torre.saas_audit (created_at desc);
