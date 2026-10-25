-- Alta de Materiales Ya en la Torre de Control. Idempotente: puede volver a correrse sin duplicar nada.
-- Se siembra el registro de la app para que la Torre la liste apenas se aplica esta migración: la app,
-- su cliente comercial, el plan base, el producto facturable, el tenant de muestra y su suscripción.
-- La app queda registrada sin números propios: los de Materiales Ya se leen por HTTP de servidor a
-- servidor (src/lib/torre/materiales-ya-fn.ts), igual que Super al Toque, no desde esta base.

insert into torre.saas_apps (
  id, name, slug, description, status, repository_url, production_url, current_version
) values (
  'app_materiales_ya', 'Materiales Ya', 'materiales-ya',
  'Punto de venta y logística para corralones',
  'active', 'https://github.com/ccalsson/materiales-ya', 'https://materiales-ya-app.vercel.app', '1.0.0'
) on conflict (id) do nothing;

-- Cliente placeholder: saas_tenants.client_id es NOT NULL y referencia acá, así que hace falta un
-- cliente para poder abrir el primer tenant de la app.
insert into torre.saas_clients (id, name, notes) values (
  'client_materiales_ya', 'Materiales Ya (interna)',
  'Cliente interno de la Torre: lo usa el tenant de muestra de Materiales Ya.'
) on conflict (id) do nothing;

-- TODO(precio): 35000 ARS es un placeholder que puso la Torre; lo tiene que confirmar el dueño.
-- Está repetido a propósito en el plan, el producto y la suscripción: los tres tienen que coincidir.
insert into torre.saas_plans (
  id, name, description, monthly_price, setup_price, status, code, currency, periodicity,
  features, limits, metadata
) values (
  'plan_materiales_ya_base', 'Materiales Ya — Base', 'Plan base del punto de venta y la logística.',
  35000, 0, 'active', 'mya-base', 'ARS', 'monthly',
  '["Punto de venta","Catálogo","Presupuestos","Reportes"]'::jsonb,
  '{"users":5,"branches":1}'::jsonb,
  '{"app_slug":"materiales-ya"}'::jsonb
) on conflict (id) do nothing;

insert into torre.saas_products (
  id, name, slug, description, kind, app_id, billing, frequency, recurring_ars, unit_label, config, status
) values (
  'prod_materiales_ya_base', 'Base Materiales Ya', 'materiales-ya-base',
  'Mensualidad del punto de venta y la logística para corralones.',
  'base_product', 'app_materiales_ya', 'recurring', 'monthly', 35000, 'puesto',
  '{"includedBranches":1,"family":"materiales-ya-base","plan":"mya-base"}'::jsonb, 'active'
) on conflict (id) do nothing;

-- operational_tenant_ref queda NULL a propósito: Materiales Ya es de un solo tenant y no es una
-- sucursal de Mostrador, así que no tiene fila en la tabla `tenants` de este repo.
insert into torre.saas_tenants (
  id, app_id, client_id, name, slug, status, plan_id, installed_version, operational_tenant_ref
) values (
  'tenant_materiales_ya_demo', 'app_materiales_ya', 'client_materiales_ya',
  'Materiales Ya — Corralón demo', 'materiales-ya-demo', 'active', 'plan_materiales_ya_base', '1.0.0', null
) on conflict (id) do nothing;

insert into torre.saas_subscriptions (
  id, client_id, tenant_id, plan_id, monthly_price, status, start_date, next_payment_date
) values (
  'sub_materiales_ya', 'client_materiales_ya', 'tenant_materiales_ya_demo', 'plan_materiales_ya_base',
  35000, 'active', current_date, (current_date + interval '1 month')::date
) on conflict (id) do nothing;
