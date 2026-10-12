create table if not exists mercado_cruces (
  id text primary key,
  sentido text not null check (sentido in ('cargador_comprador', 'comprador_puesto', 'puesto_comprador')),
  pedido_id text references pedidos (id),
  recorrido_id text references mercado_recorridos (id),
  comprador_id text references mercado_compradores (id),
  cargador_id text references mercado_cargadores (id),
  tenant_id text,
  estrellas integer not null check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

create unique index if not exists mercado_cruces_pedido_idx
  on mercado_cruces (sentido, pedido_id)
  where pedido_id is not null;

create unique index if not exists mercado_cruces_recorrido_idx
  on mercado_cruces (sentido, recorrido_id)
  where recorrido_id is not null;
