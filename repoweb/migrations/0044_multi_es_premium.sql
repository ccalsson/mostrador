-- Multi-Sucursal pasa a ser el plan Premium completo con una sucursal más.
-- Antes costaba 186 y recortaba Mercado al Toque, cuenta corriente y las cinco
-- herramientas Premium: se cobraba más por menos servicio.
--
-- prod_multi queda con kind='addon' a propósito. Por eso incluidasPorBase()
-- cuenta la sucursal incluida que la línea declara en config.includedBranches,
-- aunque no sea base_product; si no, resincronizarSucursales cobraría
-- "sucursal extra" por la sucursal que este cambio acaba de incluir.
-- config.plan='premium' habilita esPremium() y tienePremium() para el Multi.

update torre.saas_products
set description = 'Todo lo del plan Premium y una sucursal más, aparte de la matriz.',
  config = '{"family":"mercado","tier":"pro","plan":"premium","includedBranches":2}'::jsonb,
  updated_at = now()
where id = 'prod_multi';

-- Dos productos con config.plan='premium': el vínculo plan↔producto se fija a mano.
update torre.saas_plans
set metadata = coalesce(metadata, '{}'::jsonb) || '{"productId":"prod_premium"}'::jsonb,
  updated_at = now()
where id = 'plan_premium';

update torre.saas_plans
set metadata = coalesce(metadata, '{}'::jsonb) || '{"productId":"prod_multi"}'::jsonb,
  updated_at = now()
where id = 'plan_multi';

-- Load-bearing: sin esto el Multi vuelve a 1 sucursal.
update torre.saas_plans
set limits = coalesce(limits, '{}'::jsonb) || '{"branches":2}'::jsonb,
  description = 'Abono mensual. Todo Premium, con una sucursal más.',
  updated_at = now()
where id = 'plan_multi';
