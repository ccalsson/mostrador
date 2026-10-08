create table if not exists afip_config (
  tenant_id text primary key references tenants(id),
  cuit text,
  razon_social text,
  domicilio text,
  condicion text not null default 'ri',
  punto_venta integer not null default 1,
  inicio_actividades text,
  iibb text,
  alicuota numeric(5, 2) not null default 10.5,
  ambiente text not null default 'homo',
  cert_pem text,
  key_pem text,
  updated_at timestamptz not null default now()
);

alter table clientes add column if not exists condicion_iva text not null default 'consumidor_final';

create table if not exists facturas (
  id text primary key,
  tenant_id text not null references tenants(id),
  cobro_id text,
  origen_id text,
  cbte_tipo integer not null,
  punto_venta integer not null,
  numero integer,
  fecha text not null,
  doc_tipo integer,
  doc_nro text,
  receptor_nombre text,
  receptor_condicion text,
  emisor_razon text,
  emisor_cuit text,
  emisor_domicilio text,
  emisor_condicion text,
  emisor_iibb text,
  emisor_inicio text,
  ambiente text not null,
  neto numeric(14, 2) not null,
  iva numeric(14, 2) not null,
  total numeric(14, 2) not null,
  alicuota numeric(5, 2) not null,
  cae text,
  cae_vto text,
  estado text not null,
  error text,
  detalle jsonb,
  created_at timestamptz not null default now()
);

create index if not exists facturas_tenant_idx on facturas (tenant_id, created_at desc);
create unique index if not exists facturas_cobro_activa
  on facturas (tenant_id, cobro_id)
  where estado = 'autorizada' and cbte_tipo in (1, 6, 11);
create unique index if not exists facturas_nc_activa
  on facturas (tenant_id, origen_id)
  where estado = 'autorizada' and cbte_tipo in (3, 8, 13);
