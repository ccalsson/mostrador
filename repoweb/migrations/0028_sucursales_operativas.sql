create table if not exists sucursales (
  id text primary key,
  tenant_id text not null references tenants (id),
  libros_tenant_id text not null references tenants (id),
  nombre text not null,
  referencia text not null default '',
  es_matriz boolean not null default false,
  torre_branch_id text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists sucursales_una_matriz on sucursales (tenant_id) where es_matriz;
create unique index if not exists sucursales_libros on sucursales (libros_tenant_id);

create table if not exists sucursal_producto (
  sucursal_id text not null references sucursales (id),
  origen_id text not null,
  producto_id text not null,
  primary key (sucursal_id, origen_id)
);

alter table staff add column if not exists sucursal_actual_id text;
alter table staff add column if not exists puede_cambiar boolean not null default false;
