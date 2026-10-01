alter table clientes add column if not exists email text;
alter table clientes add column if not exists user_id text;
alter table clientes add column if not exists cuit text;
alter table clientes add column if not exists direccion text;
alter table clientes add column if not exists activo boolean not null default true;

create unique index if not exists clientes_user_idx on clientes (user_id) where user_id is not null;
create unique index if not exists clientes_email_idx on clientes (tenant_id, lower(email)) where email is not null;

alter table pedidos add column if not exists forma_pago text;
alter table pedidos add column if not exists comprobante_nombre text;
alter table pedidos add column if not exists comprobante_data text;

create table if not exists proveedores (
  id text primary key,
  tenant_id text not null references tenants(id),
  nombre text not null,
  cuit text,
  telefono text,
  email text,
  direccion text,
  observaciones text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists proveedores_tenant_idx on proveedores (tenant_id, activo, nombre);

alter table remitos add column if not exists proveedor_id text references proveedores(id);

create table if not exists cuenta_movimientos (
  id text primary key,
  tenant_id text not null references tenants(id),
  cliente_id text not null references clientes(id),
  tipo text not null,
  monto numeric(12, 2) not null,
  referencia text,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists cuenta_cliente_idx on cuenta_movimientos (cliente_id, created_at desc);
