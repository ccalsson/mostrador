create table if not exists caja_egresos (
  id text primary key,
  tenant_id text not null references tenants (id),
  categoria text not null,
  concepto text not null,
  monto numeric(12, 2) not null,
  medio text not null default 'efectivo',
  usuario_id text,
  created_at timestamptz not null default now(),
  check (categoria in ('alquiler', 'combustible', 'servicios', 'proveedores', 'mercaderia', 'sueldos', 'otros')),
  check (medio in ('efectivo', 'transferencia', 'otro')),
  check (monto > 0)
);

create index if not exists caja_egresos_tenant_fecha_idx on caja_egresos (tenant_id, created_at desc);
