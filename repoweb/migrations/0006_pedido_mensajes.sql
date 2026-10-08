create table if not exists pedido_mensajes (
  id text primary key,
  tenant_id text not null references tenants(id),
  pedido_id text not null references pedidos(id) on delete cascade,
  cliente_id text not null references clientes(id),
  emisor text not null,
  staff_id text,
  cuerpo text not null,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pedido_mensajes_pedido_idx on pedido_mensajes (pedido_id, created_at desc);
create index if not exists pedido_mensajes_cliente_idx on pedido_mensajes (cliente_id, created_at desc);
