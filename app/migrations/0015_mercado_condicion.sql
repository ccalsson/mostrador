-- M9g: condición comercial congelada al crear el pedido de Mercado al Toque.
-- Nullable, sin default: pedidos previos quedan NULL y textoCondicion(null) -> null.
alter table pedidos add column if not exists condicion jsonb;
