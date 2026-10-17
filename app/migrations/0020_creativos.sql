-- Creativos: el saldo vive en la casa, no en la sucursal. Espejo idempotente de
-- las migraciones 0024-0027 del workspace (en DEV esas tablas ya pueden estar).
create table if not exists creativos_saldo (
  tenant_id text primary key references tenants (id),
  creditos integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists creativos_pedidos (
  id text primary key,
  tenant_id text not null references tenants (id),
  formato text not null,
  cantidad integer not null,
  creditos integer not null default 0,
  brief text not null,
  estado text not null,
  created_at timestamptz not null default now()
);

create table if not exists creativos_variantes (
  id text primary key,
  pedido_id text not null references creativos_pedidos (id),
  n integer not null,
  titulo text not null,
  texto text not null,
  imagen text not null,
  created_at timestamptz not null default now()
);

insert into torre.saas_products (
  id, name, slug, description, kind, app_id, billing, frequency,
  setup_usd, recurring_usd, once_usd, unit_label, config, status
) values (
  'prod_creditos_50', 'Créditos de creativos, 50', 'creditos-creativos-50',
  '50 créditos. Cada foto descuenta 4 y trae cuatro textos. Torre los suma cuando habilita el pago.',
  'addon', 'app_mostrador', 'once', 'once',
  null, null, 5.99, '50 créditos',
  '{"family":"creativos","credits":50}'::jsonb, 'active'
), (
  'prod_creditos_100', 'Créditos de creativos', 'creditos-creativos-100',
  '100 créditos. Cada foto descuenta 4 y trae cuatro textos. Torre los suma cuando habilita el pago.',
  'addon', 'app_mostrador', 'once', 'once',
  null, null, 9.99, '100 créditos',
  '{"family":"creativos","credits":100}'::jsonb, 'active'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  once_usd = excluded.once_usd,
  unit_label = excluded.unit_label,
  config = excluded.config,
  status = 'active',
  updated_at = now();
