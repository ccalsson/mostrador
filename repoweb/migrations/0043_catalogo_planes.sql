-- Usuario adicional, capacitación y migración no se ofrecen.
update torre.saas_products
set status = 'archived', updated_at = now()
where id in ('prod_usuario', 'prod_capacitacion', 'prod_migracion');

-- Multi suma una sucursal. No abre Mercado.
update torre.saas_products
set
  description = 'Una sucursal más, aparte de la matriz. Mercado al Toque se contrata aparte.',
  config = '{"family":"mostrador","plan":"multi","extraBranches":1}'::jsonb,
  updated_at = now()
where id = 'prod_multi';