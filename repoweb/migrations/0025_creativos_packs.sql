update torre.saas_products set
  description = '100 créditos. Cada imagen que se genera descuenta uno. Torre los suma cuando habilita el pago.',
  once_usd = 9.99,
  unit_label = '100 créditos',
  status = 'active',
  updated_at = now()
where id = 'prod_creditos_100';

insert into torre.saas_products (
  id, name, slug, description, kind, app_id, billing, frequency,
  setup_usd, recurring_usd, once_usd, unit_label, config, status
) values (
  'prod_creditos_50', 'Créditos de creativos, 50', 'creditos-creativos-50',
  '50 créditos. Cada imagen que se genera descuenta uno. Torre los suma cuando habilita el pago.',
  'addon', 'app_mostrador', 'once', 'once',
  null, null, 5.99, '50 créditos',
  '{"family":"creativos","credits":50}'::jsonb, 'active'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  once_usd = excluded.once_usd,
  config = excluded.config,
  status = 'active',
  updated_at = now();
