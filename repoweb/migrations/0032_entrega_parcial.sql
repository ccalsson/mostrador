-- Entrega parcial: tracking de cantidad entregada y nota por item
alter table pedido_items add column if not exists cantidad_entregada numeric(12, 3) not null default 0;
alter table pedido_items add column if not exists nota_entrega text;
