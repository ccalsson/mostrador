-- `moneda` la creó app/migrations/0022_productos_moneda.sql, con backfill ARS→USD.
-- Este archivo es para bases que nunca vieron esa migración: agrega la columna sin
-- tocar ningún precio. El default es 'USD', el mismo de app, para que los dos backends
-- creen la misma tabla; en Neon DEV la columna ya existe y este script no cambia nada.
-- Ninguna escritura de producto depende de este default: todas nombran la columna.
-- Las semillas de la web están escritas en pesos y se siembran con moneda='ARS' explícita.

alter table productos add column if not exists moneda text not null default 'USD';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'productos_moneda_check'
  ) then
    execute 'alter table productos add constraint productos_moneda_check check (moneda in (''USD'', ''ARS''))';
  end if;
end $$;
