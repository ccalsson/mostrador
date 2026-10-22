-- 0023: Egresos de caja — registra extracciones de dinero del register
-- (gastos, pagos a proveedores, retiros personales, etc.)

create table if not exists egresos_caja (
  id text primary key,
  tenant_id text not null references tenants(id),
  cierre_id text not null references cierres_caja(id),
  monto numeric(12, 2) not null check (monto > 0),
  concepto text not null,
  categoria text not null default 'gasto',
  usuario_id text not null,
  creado_at timestamptz not null default now()
);

create index if not exists egresos_caja_tenant_cierre_idx
  on egresos_caja (tenant_id, cierre_id);

create index if not exists egresos_caja_tenant_fecha_idx
  on egresos_caja (tenant_id, creado_at desc);
