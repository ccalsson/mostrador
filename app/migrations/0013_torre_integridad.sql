-- Integridad comercial y contractual.
-- No cambia precios de catálogo ni el abono histórico de plan_base.
-- No crea un segundo catálogo.

create table if not exists torre.saas_price_adjustments (
  id text primary key,
  tenant_id text not null references torre.saas_tenants (id),
  line_id text references torre.saas_subscription_lines (id),
  grant_id text references torre.saas_promotion_grants (id),
  kind text not null check (kind in ('bonus', 'discount', 'freeze', 'commission_override')),
  percent numeric(8, 2),
  amount numeric(12, 2),
  currency text check (currency is null or currency in ('USD', 'ARS')),
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'ended', 'revoked')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists saas_adjustments_tenant_idx
  on torre.saas_price_adjustments (tenant_id, status, kind);

create unique index if not exists saas_adjustments_grant_once
  on torre.saas_price_adjustments (grant_id, kind, (coalesce(line_id, '')))
  where grant_id is not null;

update torre.saas_plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'catalogSlug', 'mostrador-base',
  'priceSource', 'saas_subscription_lines',
  'note', 'monthly_price del plan es encabezado. El precio aplicable de un puesto está en las líneas contratadas y en los ajustes.'
)
where id = 'plan_base' and not (coalesce(metadata, '{}'::jsonb) ? 'catalogSlug');

create or replace function torre.rechazar_version_publicada()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('published', 'retired') then
      raise exception 'version legal inmutable';
    end if;
    return old;
  end if;
  if old.status in ('published', 'retired') then
    if new.body is distinct from old.body
       or new.content_hash is distinct from old.content_hash
       or new.version_label is distinct from old.version_label
       or new.document_id is distinct from old.document_id then
      raise exception 'version legal inmutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists saas_legal_versions_inmutable on torre.saas_legal_versions;
create trigger saas_legal_versions_inmutable
  before update or delete on torre.saas_legal_versions
  for each row execute function torre.rechazar_version_publicada();

create or replace function torre.rechazar_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.snapshot_body is distinct from old.snapshot_body
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.version_id is distinct from old.version_id
     or new.document_id is distinct from old.document_id
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'snapshot contractual inmutable';
  end if;
  return new;
end;
$$;

drop trigger if exists saas_contracts_snapshot_inmutable on torre.saas_tenant_contracts;
create trigger saas_contracts_snapshot_inmutable
  before update on torre.saas_tenant_contracts
  for each row execute function torre.rechazar_snapshot();

create or replace function torre.rechazar_mutacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'registro inmutable';
end;
$$;

drop trigger if exists saas_audit_inmutable on torre.saas_audit;
create trigger saas_audit_inmutable
  before update or delete on torre.saas_audit
  for each row execute function torre.rechazar_mutacion();

drop trigger if exists saas_acceptances_inmutable on torre.saas_contract_acceptances;
create trigger saas_acceptances_inmutable
  before update or delete on torre.saas_contract_acceptances
  for each row execute function torre.rechazar_mutacion();

create or replace function torre.proteger_precio_congelado()
returns trigger
language plpgsql
as $$
begin
  if new.unit_price is distinct from old.unit_price and exists (
    select 1
    from torre.saas_price_adjustments a
    where a.line_id = old.id
      and a.kind = 'freeze'
      and a.status = 'active'
      and a.starts_on <= current_date
      and (a.ends_on is null or a.ends_on >= current_date)
  ) then
    raise exception 'precio congelado';
  end if;
  return new;
end;
$$;

drop trigger if exists saas_lines_precio_congelado on torre.saas_subscription_lines;
create trigger saas_lines_precio_congelado
  before update on torre.saas_subscription_lines
  for each row execute function torre.proteger_precio_congelado();
