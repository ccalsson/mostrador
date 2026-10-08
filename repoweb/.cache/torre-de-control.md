# Torre de Control — plan cacheado

Fuente: adjunto `torre.pdf` (12 páginas). Guardado 2026-10-05. No implementar hasta confirmar las preguntas abiertas.

## Qué es

Herramienta interna de la software house. No se vende. Administra las apps SaaS, clientes, tenants, planes, suscripciones, ingresos, gastos, versiones y deployments.

No es CRM, facturación, contabilidad, soporte ni automatizaciones.

## Reglas

- Misma instancia PostgreSQL/Neon que Mostrador. No migrar de motor. No Supabase.
- No rehacer Mostrador ni cambiar su arquitectura.
- Tablas nuevas con prefijo `saas_`, separadas de las operativas.
- Misma auth (Better Auth). Solo usuarios autorizados. Un tenant/staff de Mostrador no entra a la Torre.
- Sin actualización automática Android/Windows. La arquitectura de versiones y deployments queda lista para GitHub Actions después.
- Stack: React 19, TypeScript, Vite, Tailwind, TanStack Start. Reusar conexión, auth, UI y migraciones.
- UI: sidebar, dashboard, tablas, filtros, formularios, badges. Sin animaciones.

## Menú

Dashboard, Aplicaciones, Clientes, Tenants, Planes, Suscripciones, Finanzas, Versiones, Deployments, Configuración.

## Tablas

- `saas_apps`: id, name, slug, description, status, repository_url, production_url, current_version, created_at, updated_at
- `saas_clients`: id, name, business_name, contact_name, phone, email, notes, status, created_at, updated_at
- `saas_tenants`: id, app_id, client_id, name, slug, status, plan_id, installed_version, last_activity_at, created_at, updated_at. Un tenant es un puesto/comercio, no un dispositivo.
- `saas_plans`: id, name, description, monthly_price, setup_price, status, created_at, updated_at
- `saas_subscriptions`: id, client_id, tenant_id, plan_id, monthly_price, status, start_date, next_payment_date, created_at, updated_at
- `saas_payments`: id, client_id, subscription_id, amount, payment_date, concept, status, notes, created_at
- `saas_expenses`: id, app_id nullable, concept, provider, amount, frequency, expense_date, notes, created_at. Rubros: hosting, base de datos, dominios, IA, herramientas, APIs, otros.
- `saas_versions`: id, app_id, version, platform (web | android | windows), release_date, changelog, download_url nullable, status, created_at
- `saas_deployments`: id, app_id, tenant_id nullable, version_id, platform, status (pending | deployed | failed | rolled_back), deployed_at, notes

## Pantallas

- Dashboard: apps activas, clientes activos, tenants activos, ingresos del mes, gastos del mes, margen. Lista de apps (nombre, tenants, versión, estado). Alertas: tenant desactualizado, pago vencido, app sin versión, deployment fallido.
- Tenants: columnas Tenant, Aplicación, Cliente, Plan, Estado, Versión instalada, Última actividad. Acciones ver, editar, desactivar.
- Versiones: por app, versión disponible y cada tenant al día o atrasado. Ejemplo Mostrador 1.0.5 vs puestos 1.0.4 / 1.0.3.

## Fases

1. Inspeccionar sin tocar Mostrador.
2. Migración reversible `saas_*`. Verificar que Mostrador sigue.
3. CRUD de las nueve entidades.
4. UI Torre.
5. Dashboard con métricas desde Postgres.
6. Seed mínimo solo en `saas_*`: 1 app Mostrador, 1 cliente, 1 tenant, 1 plan, 1 suscripción, 1 pago, 2 gastos, 2 versiones, 1 deployment. No volver a sembrar operaciones de Mostrador.
7. Build. No cerrar hasta: compila, arranca, autentica, consulta la base, crea cliente, tenant, suscripción, gasto, versión y muestra el dashboard.

## Futuro (no ahora)

GitHub Actions, deploys automáticos, publicación Android/Windows, update de clientes, health, logs, monitoreo, alertas, soporte, métricas de uso, updates centralizados.

## Diagnóstico corto (inspección, sin cambios)

1. Arquitectura: una sola app TanStack Start. Rutas en `src/routes`. SQL a mano con `getSql()` (Neon si hay `DATABASE_URL`, PGLite en preview). Migraciones en `migrations/0001`–`0007`. Auth Better Auth. Roles de puesto: admin, cajero, vendedor. Tabla operativa `tenants` (hoy `frutas-roman`).
2. Neon: la Torre usaría el mismo `getSql()` / `DATABASE_URL`. En este sandbox, si no hay URL, cae a PGLite. No hay un segundo cliente de base.
3. Integración natural: módulo propio con shell y rutas `/torre/*`, sin mezclar el menú del puesto.
4. Tablas: las nueve `saas_*` de arriba, migración nueva, sin FKs hacia pedidos, cobros ni clientes del mostrador.
5. Archivos nuevos, más el registro de rutas que genera el framework. No reescribir caja, puesto, remitos ni auth del comercio.
6. Riesgo: misma base y misma cookie de sesión. Si el guard falla, un cajero podría abrir la Torre. Hay que autorizar por una lista distinta del rol del puesto. El seed de la Torre no debe escribir en tablas operativas.

## Decisiones cerradas (2026-10-05)

- Consola interna. No la ve el puesto ni un cliente de Mostrador.
- Misma instancia Neon, schema propio `torre`. No es otra base ni otro motor.
- Acceso inicial: solo calssonclaudio@gmail.com. La pantalla Configuración administra esa lista.
- `torre.saas_tenants.id` es UUID/id propio.
- `operational_tenant_ref` es texto, referencia lógica, sin FK a `public.tenants`.
- No se modifican tablas operativas de Mostrador.
- Ruta: `/torre`. No aparece en el menú del puesto.
- Un correo de la Torre no se convierte en empleado del puesto.

