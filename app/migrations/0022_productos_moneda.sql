-- Catálogo en USD: los precios de productos se almacenan en dólares.
-- El cobro se calcula en ARS con la fórmula del spec:
--   ARS = USD × cotización × 1.05, redondeo para arriba a múltiplo de 100.
--
-- Backfill: los precios existentes (en ARS) se convierten a USD dividiendo
-- por la cotización más reciente en torre.saas_fx_rates. Si no hay cotización
-- (raro, el seed inicial carga una), se mantiene el precio y se marca moneda='ARS'.

alter table productos add column if not exists moneda text not null default 'USD';

alter table productos add constraint productos_moneda_check
  check (moneda in ('USD', 'ARS'));

do $$
declare
  fx numeric;
begin
  select usd_ars into fx from torre.saas_fx_rates order by as_of desc limit 1;
  if fx is not null and fx > 0 then
    update productos
      set moneda = 'USD',
          precio = round((precio / fx)::numeric, 2)
      where moneda = 'USD';
  end if;
end $$;
