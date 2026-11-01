create table if not exists reposicion_dias (
  tenant_id text primary key references tenants (id),
  dias jsonb not null,
  updated_at timestamptz not null default now()
);
