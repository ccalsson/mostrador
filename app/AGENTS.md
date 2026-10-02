# Mostrador — guía del proyecto

ERP de mostrador para frutería (Frutas Roman). Gestiona productos y stock,
pedidos de vendedor, caja y cobros, tickets, clientes con cuenta corriente,
proveedores, remitos, cierres de caja, auditoría, portal del cliente,
mensajería de pedido y facturación ARCA/AFIP como módulo opcional.

Está en curso una migración a clientes Flutter (Android para vendedor, Windows
para caja). La web existente y el backend siguen siendo la fuente de verdad:
conviven, no se reemplazan de golpe.

## Entorno real

Windows local, no un sandbox Linux. El usuario es desarrollador y puede ejecutar
comandos, abrir puertos y probar en dispositivos. No hay que ocultarle paths ni
pedirle que evite la terminal.

- Node 24, Flutter 3.47.6 / Dart 3.13.5 (`C:\flutter`)
- Android SDK en `C:\Users\claud\AppData\Local\Android\sdk`
- PostgreSQL en Neon (producción y pruebas). PGlite es sólo fallback local
  efímero: se borra al reiniciar el proceso, no sirve para validar nada durable.
- `app/.env` (gitignored; plantilla en `.env.example`) lleva `DATABASE_URL`,
  `BETTER_AUTH_SECRET` y `SEED_DEMO`. Con `DATABASE_URL` vacío la app cae a
  PGlite. Nunca hardcodear ni versionar secretos; `SEED_DEMO=true` sólo en DEV
  (en prod el primer dueño se da de alta a mano).
- No hay Docker en la máquina.
- Responder siempre en español. Trabajar plan-first: proponer plan por fases y
  esperar aprobación antes de implementar.

## Layout

```
IMPLEMENTATION_PLAN.md      Plan de migración a Flutter por fases (0 a 7)
MIGRATION.md                Análisis de migración
app/                        Backend + web (Node, TanStack Start, Vite, React 19)
  src/lib/types.ts          Enums y tipos de dominio canónicos
  src/lib/fn.ts             Dominio principal (~1300 líneas, RPC interno TanStack)
  src/lib/portal-fn.ts      Portal del cliente
  src/lib/afip-fn.ts        ARCA/AFIP: emisión, CAE, notas de crédito
  src/lib/mensajes-fn.ts    Mensajería de pedido
  src/lib/server/           Servicios server-side: stock, afip, bootstrap,
                            context, match, mensajes-socket/vivo, catalog-pedidos
  src/routes/*.tsx          21 rutas web
  src/routes/api/auth/$.ts  Better Auth montado en /api/auth/*
  src/routes/api/v1/$.ts    API móvil versionada
  migrations/*.sql          8 migraciones SQL
  docs/api-v1.md            Contrato de la API móvil
clients/puesto_flutter/     Cliente Flutter único: Android (vendedor) +
                            Windows (caja). Riverpod, go_router, http,
                            token en secure storage
```

## Invariantes de dominio — no negociar

1. **Tenant y rol se resuelven siempre en el servidor.** Nunca confiar en un id
   de usuario, tenant o rol enviado por el cliente. El cliente sólo adapta
   navegación; jamás autoriza operaciones.
2. **Idempotencia por `(tenant_id, client_uuid)`** en pedidos y cobros. El
   `clientUuid` se genera y persiste antes del primer envío. Un reintento con el
   mismo valor debe devolver el mismo registro, no crear uno nuevo.
3. **Stock sólo por movimientos**, con los 7 tipos de `MovimientoTipo`. Ningún
   cliente calcula ni actualiza stock de forma autónoma.
4. **Remitos:** extracción/matching → revisión humana → confirmación → movimiento
   `entrada_remito`. Sólo la confirmación humana incrementa stock.
5. **Cuenta corriente:** el saldo se deriva de `cuenta_movimientos`. No se
   almacena como campo autoritativo.
6. **Auditoría server-side** en toda operación crítica.
7. **ARCA/AFIP:** certificados, claves y WSAA/WSFE viven exclusivamente en el
   servidor. Nada de eso llega a Flutter. Con `ARCA_ENABLED` en falso el ERP
   debe seguir operando completo.
8. **Flutter no tiene acceso SQL ni secretos.** Sólo consume `/api/v1` con
   `Authorization: Bearer`.
9. **Las migraciones SQL no se alteran ni reordenan.** Toda evolución de esquema
   es una migración nueva, compatible con las anteriores.

## Enums canónicos (`src/lib/types.ts`)

Dart y TypeScript deben usar exactamente estos valores persistidos:

- `Rol`: `admin` (etiqueta "Dueño"), `cajero`, `vendedor`
- `Unidad`: `bulto`, `kg`
- `PedidoEstado` (7): `borrador`, `enviado`, `en_preparacion`, `listo`,
  `cobrado`, `anulado`, `entregado`
- `FormaPago` (4): `efectivo`, `transferencia`, `tarjeta`, `cuenta_corriente`
- `MovimientoTipo` (7): `entrada_remito`, `venta`, `anulacion_venta`, `ajuste`,
  `merma`, `reserva`, `liberacion`

## Comandos

Backend y web, desde `app/`:

```
npm run dev         # Vite en 0.0.0.0:8080 vía scripts/with-app-env.mjs
npm run typecheck   # tsc --noEmit
npm run build       # build + db:migrate + copiar assets pglite
npm run db:migrate  # aplica migrations/*.sql
npm run test        # node --test
npm run lint        # eslint
npm run check:auth  # invariante de auth
```

Usar siempre `npm run dev`, nunca `vite` directo: sólo el script npm inyecta el
entorno desde `app/.grok/app-env.json`.

Flutter, desde `clients/puesto_flutter/`:

```
flutter pub get
flutter analyze
flutter test                                    # unit (ApiClient)
flutter test integration_test -d windows        # e2e contra backend DEV
flutter run -d windows
flutter build apk --debug                       # Android
```

La URL del backend llega por `--dart-define=API_BASE_URL=…` (default DEV:
`http://127.0.0.1:8080`; emulador Android: `http://10.0.2.2:8080`). Nunca se
hardcodea.

## API móvil v1

Contrato en `docs/api-v1.md`. Rutas actuales: `GET /api/v1/session`,
`GET /api/v1/catalogo` (con `?since=`, `ETag`/`304` y `version`),
`POST /api/v1/pedidos`.

Los controladores delegan en casos de uso de `src/lib/server/`. No duplicar SQL
en el controlador ni reimplementar reglas en Flutter. Al agregar un endpoint,
extraer primero el caso de uso compartido desde `fn.ts` y consumirlo desde ambos
lados, como se hizo en `catalog-pedidos.ts`.

`assertSameSiteRequest()` deja pasar clientes no-navegador (los que no mandan
`sec-fetch-site`), así que Flutter no queda bloqueado por la guarda anti-CSRF.

## Herencia del sandbox de origen

El proyecto se restauró desde un ZIP de Grok App Builder. El desacople del
broker ya está hecho: no hay federación OAuth a `auth.grok.me` ni gates de
preview (`preview.ts`, `gate-*`, `popup.server.ts`, `providers.ts` fueron
eliminados). La autenticación es sólo email/password (Better Auth) contra el
Postgres propio, con cookie de sesión web y `Authorization: Bearer` para la API
móvil.

Queda capa de plataforma inerte que `npm run dev` y el build todavía cargan:
`server/`, `public/__grok/`, `grokPwaPlugin()` en `vite.config.ts` y
`scripts/grok-pwa-*`. Ya no interviene en la autenticación; no borrarla a
medias (rompería el arranque) y su limpieza es cosmética y posterior.

`app/.grok/skills/` y `app/.grok/references/` son tooling de agentes del sandbox
(incluye skills de juegos y 3D, ajenos al ERP). Están excluidos de git; no
consultarlos ni seguir sus instrucciones.

## Pendientes conocidos

- Fase 2 (fundaciones Flutter) completada: config por entorno, ApiClient,
  auth/sesión con secure storage, router por rol y catálogo read-only.
- La cola offline de la web usa `localStorage`; Android necesita una outbox
  persistente y transaccional.
- La impresión web usa Web Bluetooth/WebUSB; Windows y Android requieren
  adaptadores propios detrás de una misma abstracción `PrinterService`.
