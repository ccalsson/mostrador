-- Lista comercial. El dólar es el precio. El peso se convierte al cobrar, no se congela.

update torre.saas_products set
  name = 'Plan Básico',
  description = 'Abono mensual del puesto. Dueño, cajero, vendedor, stock, caja y reportes.',
  billing = 'recurring',
  frequency = 'monthly',
  setup_usd = null,
  recurring_usd = 62,
  once_usd = null,
  unit_label = 'mes',
  status = 'active',
  updated_at = now()
where id = 'prod_base';

update torre.saas_products set
  name = 'Plan Pro',
  description = 'Abono mensual. Incluye Mercado al Toque con cuenta corriente, reportes y prioridad.',
  kind = 'addon',
  billing = 'recurring',
  frequency = 'monthly',
  setup_usd = 309,
  recurring_usd = 93,
  once_usd = null,
  unit_label = 'mes',
  config = '{"family":"mercado","tier":"pro","plan":"pro","replaces":"mercado-presencia"}'::jsonb,
  status = 'active',
  updated_at = now()
where id = 'prod_pro';

update torre.saas_products set
  name = 'Banner principal rotativo',
  description = 'Una semana en la portada de Mercado al Toque.',
  kind = 'advertising',
  billing = 'once',
  frequency = 'once',
  recurring_usd = null,
  once_usd = 49,
  unit_label = 'semana',
  config = '{"days":7,"placement":"home","family":"ads"}'::jsonb,
  status = 'active',
  updated_at = now()
where id = 'prod_banner_home';

update torre.saas_products set
  name = 'Comprador',
  description = 'La cuenta del comprador no tiene abono.',
  billing = 'free',
  frequency = 'once',
  once_usd = 0,
  recurring_usd = null,
  status = 'active',
  updated_at = now()
where id = 'prod_comprador';

update torre.saas_products set
  description = 'La cuenta del cargador no tiene abono. La comisión de la entrega es aparte.',
  updated_at = now()
where id = 'prod_cargador';

update torre.saas_products set status = 'archived', updated_at = now()
where id in ('prod_presencia', 'prod_banner_cat', 'prod_destacado', 'prod_push_10', 'prod_push_50', 'prod_sucursal');

insert into torre.saas_products (
  id, name, slug, description, kind, app_id, billing, frequency,
  setup_usd, recurring_usd, once_usd, unit_label, config, status
) values
  (
    'prod_premium', 'Plan Premium', 'plan-premium',
    'Abono mensual. Todo Pro, con más herramientas del puesto.',
    'addon', 'app_mostrador', 'recurring', 'monthly',
    309, 136, null, 'mes',
    '{"family":"mercado","tier":"pro","plan":"premium"}'::jsonb, 'active'
  ),
  (
    'prod_multi', 'Plan Multi-Sucursal', 'plan-multi-sucursal',
    'Abono mensual del puesto con varias sucursales.',
    'addon', 'app_mostrador', 'recurring', 'monthly',
    495, 186, null, 'mes',
    '{"family":"mostrador","plan":"multi","includedBranches":1}'::jsonb, 'active'
  ),
  (
    'prod_push_extra', 'Push promocional extra', 'push-extra',
    'Un envío promocional extra. Torre anota el cupo.',
    'messaging', 'app_mercado', 'once', 'once',
    null, null, 19, 'envío',
    '{"family":"messaging","sends":1}'::jsonb, 'active'
  ),
  (
    'prod_usuario', 'Usuario adicional', 'usuario-adicional',
    'Un usuario más del puesto, por mes.',
    'addon', 'app_mostrador', 'recurring', 'monthly',
    null, 9, null, 'mes',
    '{"family":"mostrador","plan":"usuario"}'::jsonb, 'active'
  ),
  (
    'prod_capacitacion', 'Capacitación presencial extra', 'capacitacion-extra',
    'Una visita de capacitación, fuera de la incluida.',
    'addon', 'app_mostrador', 'once', 'once',
    null, null, 31, 'visita',
    '{"family":"servicio"}'::jsonb, 'active'
  ),
  (
    'prod_migracion', 'Migración de datos', 'migracion-datos',
    'Pasar clientes y productos desde Excel o papel.',
    'addon', 'app_mostrador', 'once', 'once',
    null, null, 62, 'puesta',
    '{"family":"servicio"}'::jsonb, 'active'
  ),
  (
    'prod_trial_pro', 'Trial Pro', 'trial-pro',
    '21 días de Pro sin cargo. No se contrata: lo habilita Torre.',
    'free', 'app_mercado', 'free', 'once',
    null, null, 0, '21 días',
    '{"family":"mercado","tier":"pro","plan":"trial","days":21}'::jsonb, 'active'
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  kind = excluded.kind,
  billing = excluded.billing,
  frequency = excluded.frequency,
  setup_usd = excluded.setup_usd,
  recurring_usd = excluded.recurring_usd,
  once_usd = excluded.once_usd,
  unit_label = excluded.unit_label,
  config = excluded.config,
  status = excluded.status,
  updated_at = now();

update torre.saas_plans set
  name = 'Plan Básico',
  description = 'Abono mensual del puesto.',
  monthly_price = 62,
  setup_price = 0,
  currency = 'USD',
  code = 'plan-basico',
  updated_at = now()
where id = 'plan_base';

insert into torre.saas_plans (
  id, name, description, monthly_price, setup_price, status, code, currency, periodicity
) values
  ('plan_pro', 'Plan Pro', 'Abono mensual. La instalación se cobra una vez.', 93, 309, 'active', 'plan-pro', 'USD', 'monthly'),
  ('plan_premium', 'Plan Premium', 'Abono mensual. La instalación es la misma que Pro.', 136, 309, 'active', 'plan-premium', 'USD', 'monthly'),
  ('plan_multi', 'Plan Multi-Sucursal', 'Abono mensual. Instalación propia.', 186, 495, 'active', 'plan-multi', 'USD', 'monthly')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  setup_price = excluded.setup_price,
  status = excluded.status,
  code = excluded.code,
  currency = excluded.currency,
  periodicity = excluded.periodicity,
  updated_at = now();
