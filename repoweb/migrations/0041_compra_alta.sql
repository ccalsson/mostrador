-- Alta de la compra inteligente: el comprador sube el comprobante y Torre habilita.
create table if not exists mercado_compra_alta (
  id text primary key,
  comprador_id text not null,
  estado text not null,
  precio_ars numeric(12, 2) not null,
  comprobante_nombre text,
  comprobante_data text,
  desde date,
  hasta date,
  created_at timestamptz not null default now()
);

create index if not exists mercado_compra_alta_estado_idx
  on mercado_compra_alta (estado, created_at desc);