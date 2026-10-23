-- Costo por producto para cálculo de margen.
-- Nullable: los productos existentes quedan sin costo hasta que se cargue.
alter table productos add column if not exists costo numeric(12, 2);
