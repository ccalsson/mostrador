-- Checklist de entrega: items pendientes antes de marcar un pedido como entregado.

create table if not exists checklist_items (
  id text primary key,
  pedido_id text not null references pedidos(id) on delete cascade,
  descripcion text not null,
  completado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_pedido_idx on checklist_items (pedido_id);

create table if not exists checklist_templates (
  id text primary key,
  tenant_id text not null references tenants(id),
  nombre text not null,
  items jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists checklist_templates_tenant_idx on checklist_templates (tenant_id) where activo;
