-- White-Label: marca personalizada por tenant
create table if not exists torre.white_label_config (
  id text primary key,
  tenant_id text not null unique references torre.saas_tenants(id),
  marca_nombre text not null default '',
  logo_url text not null default '',
  color_primario text not null default '#1a7a4c',
  color_secundario text not null default '#e3c56a',
  color_fondo text not null default '#ffffff',
  color_texto text not null default '#1a1a1a',
  fuente text not null default 'Inter',
  template text not null default 'clasico',
  dominio_propio text,
  dominio_activo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists white_label_tenant_idx on torre.white_label_config(tenant_id);
