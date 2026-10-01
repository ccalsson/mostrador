-- Mostrador ERP — Frutas Román, el Jujeño

create table if not exists tenants (
  id text primary key,
  nombre text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id text primary key,
  tenant_id text not null references tenants(id),
  user_id text not null unique,
  nombre text not null,
  email text not null,
  rol text not null check (rol in ('admin', 'cajero', 'vendedor')),
  activo boolean not null default true,
  ultimo_login timestamptz,
  permisos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_tenant_idx on staff (tenant_id);

create table if not exists productos (
  id text primary key,
  tenant_id text not null references tenants(id),
  nombre text not null,
  unidad text not null check (unidad in ('bulto', 'kg')),
  unidad_label text not null,
  precio numeric(12, 2) not null,
  stock numeric(12, 3) not null default 0,
  stock_minimo numeric(12, 3) not null default 5,
  alias jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists productos_tenant_nombre_idx on productos (tenant_id, lower(nombre));

create table if not exists clientes (
  id text primary key,
  tenant_id text not null references tenants(id),
  nombre text not null,
  telefono text,
  cuenta_corriente boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists pedidos (
  id text primary key,
  tenant_id text not null references tenants(id),
  client_uuid text not null,
  vendedor_id text,
  cliente_id text,
  cliente_nombre text not null default 'Mostrador',
  estado text not null,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_uuid)
);
create index if not exists pedidos_tenant_estado_idx on pedidos (tenant_id, estado, created_at desc);

create table if not exists pedido_items (
  id text primary key,
  pedido_id text not null references pedidos(id) on delete cascade,
  producto_id text not null,
  nombre_snapshot text not null,
  cantidad numeric(12, 3) not null,
  precio_unitario numeric(12, 2) not null,
  unidad text not null,
  unidad_label text not null
);

create table if not exists cobros (
  id text primary key,
  tenant_id text not null references tenants(id),
  pedido_id text not null,
  client_uuid text not null,
  forma_pago text not null,
  monto numeric(12, 2) not null,
  monto_recibido numeric(12, 2),
  vuelto numeric(12, 2),
  usuario_id text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, client_uuid)
);
create index if not exists cobros_tenant_fecha_idx on cobros (tenant_id, created_at desc);

create table if not exists tickets (
  id text primary key,
  cobro_id text not null unique,
  tenant_id text not null,
  numero integer not null,
  contenido jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists ticket_seq (
  tenant_id text primary key references tenants(id),
  ultimo integer not null default 1000
);

create table if not exists stock_movimientos (
  id text primary key,
  tenant_id text not null references tenants(id),
  producto_id text not null,
  tipo text not null,
  cantidad numeric(12, 3) not null,
  referencia text,
  usuario_id text,
  created_at timestamptz not null default now()
);

create table if not exists remitos (
  id text primary key,
  tenant_id text not null references tenants(id),
  proveedor text,
  fuente text not null,
  estado text not null,
  archivo_nombre text,
  created_at timestamptz not null default now(),
  confirmado_at timestamptz,
  confirmado_por text
);

create table if not exists remito_items (
  id text primary key,
  remito_id text not null references remitos(id) on delete cascade,
  descripcion_original text not null,
  producto_id text,
  cantidad numeric(12, 3) not null,
  precio numeric(12, 2),
  confianza_match numeric(4, 2) not null default 0,
  confirmado boolean not null default false
);

create table if not exists alertas (
  id text primary key,
  tenant_id text not null references tenants(id),
  tipo text not null,
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists auditoria (
  id text primary key,
  tenant_id text not null,
  usuario_id text,
  usuario_nombre text,
  accion text not null,
  entidad text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists auditoria_tenant_fecha_idx on auditoria (tenant_id, created_at desc);

create table if not exists cierres_caja (
  id text primary key,
  tenant_id text not null references tenants(id),
  usuario_id text not null,
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  esperado numeric(12, 2),
  real numeric(12, 2),
  diferencia numeric(12, 2),
  totales jsonb,
  notas text
);
