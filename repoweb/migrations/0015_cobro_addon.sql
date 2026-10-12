-- Implementación de Mostrador: USD 1.000. Solo reemplaza el valor anterior de 975.
update torre.saas_products
set setup_usd = 1000, updated_at = now()
where id = 'prod_base' and setup_usd = 975;

alter table torre.saas_payments add column if not exists medio text;
alter table torre.saas_payments add column if not exists comprobante_nombre text;
alter table torre.saas_payments add column if not exists comprobante_data text;
