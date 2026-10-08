-- Condición comercial copiada al crear el pedido. No es un segundo catálogo:
-- el porcentaje y la banda salen de Torre y no se recalculan después.
alter table pedidos add column if not exists condicion jsonb;
