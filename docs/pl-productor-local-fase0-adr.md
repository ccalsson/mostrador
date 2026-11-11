# Mostrador Productor Local — Fase 0: auditoría, ADR y plan

**Fecha:** 10/11/2026 · **HEAD auditado:** `1ff9336` · **Autor:** auditoría con tres agentes de sólo lectura, cada cita verificada a mano contra el árbol de trabajo.
**Estado:** documento de decisión. **Ninguna de estas capacidades existe todavía.** No se editó código de backend ni de Torre; los dos cambios de Flutter al final (§7) son de la queja previa del teléfono, no del PL.

Especificación de referencia: `Mostrador_Productor_Local_PL_Arquitectura_y_Plan_Agentes.md` (raíz del repo).

---

## 1. Veredicto

El PL **sí** puede construirse sobre el repo actual sin segundo ERP, sin segunda base y sin tercer APK. El coste real no está en la UI —son cuatro pestañas que apilan paneles que ya existen— sino en **tres huecos del servidor** que la especificación cree resueltos y no lo están:

1. **No hay licencia por plan en casi ningún endpoint.** Hoy la autorización es rol + tenant. Un PL que escriba la URL de remitos, proveedores, ARCA o reportes avanzados los recibe, porque ninguno consulta `torre.saas_*`.
2. **La barrera "transferencia informada ≠ acreditado" no protege el retiro.** La spec pide "preservar esta barrera"; no hay barrera que preservar.
3. **El arqueo de caja no distingue efectivo de transferencia**, así que la prueba de aceptación "venta local por transferencia no aumenta el efectivo físico" falla hoy.

Nada de esto es específico del PL: son deudas del puesto mayorista que el PL heredará el primer día. Por eso van **antes** del shell.

---

## 2. Lo que existe y se reutiliza tal cual

| pieza | dónde | qué da |
|---|---|---|
| Esquema comercial Torre completo | `app/migrations/0008_torre.sql:41,52,68` · `0011_torre_control.sql:31,147` · `0012_torre_legal.sql:27-34` | planes con `code/currency/periodicity/features/limits`, suscripciones con `past_due/suspended`, líneas por producto, promociones y grants |
| Vínculo Torre ↔ puesto | `0008_torre.sql:52` (`saas_subscriptions.tenant_id`) y `:52` de `saas_tenants.operational_tenant_ref` | ya permite resolver el plan desde el tenant operativo |
| Resumen de suscripción | `app/src/lib/server/legal.ts:124-271` → `GET /api/v1/suscripcion` (`app/src/routes/api/v1/$.ts:1097`) | plan, add-ons activos, sucursales contratadas, presencia Mercado, precio vigente, contratos y aceptaciones |
| Patrón de capacidad con caché | `app/src/lib/server/capabilities.ts:44` (`exigirCuentaCorriente`) | fail-closed, TTL 60 s, por tenant — es la plantilla exacta de `allow()` |
| Roles de staff | `0002_mostrador.sql` `staff.rol check in ('admin','cajero','vendedor')` + `permisos_extra jsonb` | el PL no necesita un rol nuevo; la spec acierta |
| Stock por movimientos, con reserva | `app/src/lib/server/stock.ts:17-29,94-127` | 7 tipos; disponible de Mercado ya neto de reservas (`mercado.ts:511`) |
| Venta directa de caja | `POST /pedidos` + `POST /pedidos/:id/cobrar`, idempotentes por `(tenant, client_uuid)` (`cobros.ts:20-41`) | el "cobrar en pocos toques" ya está hecho en el backend |
| Cargador | `mercado.ts:860,973,1114,1151` + `0009_mercado.sql:90-117` | asignación, retiro, entrega; no hay que inventar un rol "changarín" |
| Presentaciones reales | `unidad_label` de texto libre sobre `unidad='bulto'` (semilla `app/src/lib/catalog.ts:44-51`) | docena, atado, cajón, bolsa y maple **ya se muestran hoy** |
| Layout telefónico de Caja | `caja_pane.dart:39,45,51` (umbrales 140/700/200) | la ficha ya gana la pantalla bajo 700dp; la pestaña Caja del PL es reutilización pura |

---

## 3. ADR — decisiones

### ADR-1 · `businessProfile` vive en `tenants.config` (jsonb), no en una columna
**Decisión:** clave `businessProfile: 'PRODUCTOR_LOCAL'` dentro de `tenants.config`, validada en la capa de servicio.
**Por qué:** `tenants(id, nombre, config jsonb, created_at)` (`0002_mostrador.sql:3-8`) y **no existe un solo `alter table tenants`** en las 37 migraciones de `app/`. Con jsonb: cero migraciones, y `getTenant` (`app/src/lib/server/context.ts:6-21`) ya carga la config en cada request, así que exponer el perfil en `/session` no cuesta queries extra.
**Descartado:** columna nueva con CHECK — obliga a migración y a retocar `createTenant`, sin ganar nada que un predicado en servidor no iguale.
**Consecuencia:** el perfil se escribe desde Torre (`repoweb/src/lib/torre/alta-negocio.ts`), nunca desde el cliente.

### ADR-2 · Capacidades resueltas en un único `entitlements.ts`, expuestas por `/session` y exigidas por operación
**Decisión:** módulo nuevo `app/src/lib/server/entitlements.ts` con
`capabilities(staff) → { [capacidad]: boolean }` = `saas_plans.features` (declarativo) ∧ líneas vigentes ∧ `status ∈ {active, past_due}`, con el mismo caché 60 s fail-closed de `capabilities.ts:44`. Sobre eso, `allow(staff, 'orders.manage')` como único gate de escritura.
**Por qué:** hoy `features` **existe como columna pero no lo lee nadie** — todo se deriva de `config->>'tier'|'plan'`. Centralizar evita el patrón actual de cinco gates dispersos (`clientes.ts:92`, `productos.ts:41`, `sucursales.ts:158`, `marca.ts:109`, `mercado.ts:491`).
**Punto crítico:** la exposición **no puede** ir sólo por `/suscripcion`, porque `legal.ts:125` es `assertAdmin`. Un vendedor o cajero PL no puede leer capacidades ahí. Se agregan `businessProfile`, `uiProfile` y `capabilities` al payload de `/session` (`$.ts:371-379`, hoy sólo trae `staff`, `tenantId`, `casaId`, `sucursal`, `contextoProtegido`). Es aditivo: el Dart lee claves fijas y tolera desconocidas.
**Fallo de Torre:** hoy `/suscripcion` sin try/catch devuelve **400 invalid_request** (`$.ts:150-161`). Hay que definir estado explícito (503 + gracia) antes de que una licencia pueda tumbar una caja en venta.

### ADR-3 · Tres ejes que no se derivan entre sí
`businessProfile` (qué es el negocio) ≠ `plan` (qué pagó) ≠ `rol` (qué puede hacer esta persona). Consecuencia práctica: un PL con rol `vendedor` **no** cobra identidad ni suscripción; un mayorista con `admin` sí. Ninguno de los tres se lee de almacenamiento local ni del JSON que manda el cliente.

### ADR-4 · La presencia en Mercado del plan PL es una capacidad, no una línea add-on
**Decisión:** `market.publish: true` dentro de `features` del plan PL; **no** crear una línea `saas_subscription_lines` de tipo add-on.
**Por qué:** hoy la presencia se cobra como add-on (`legal.ts:229` deriva `activo` de una línea no-base). Si el plan de ARS 50.000 "ya la incluye" y además se materializa como línea, el puesto paga dos veces o el resumen muestra un precio que no es el contratado. Y `precioVigente` (`legal.ts:247`) mezcla `sub.monthly_price` con `p.currency`: un plan nuevo en ARS sobre una suscripción vieja en USD muestra un importe falso.

### ADR-5 · Unidades: una migración aditiva y una función de equivalencia, no un rediseño
**Decisión:** `alter table productos drop constraint productos_unidad_check` + `add constraint ... check (unidad in ('bulto','kg','docena','atado','cajón','bolsa'))` en una migración nueva; `Unidad` se ensancha en `app/src/lib/types.ts:4` y en Dart; y los tres contadores de bultos (`mercado.ts:721,756,1028`) pasan a `equivalencias.ts`.
**Por qué:** el CHECK de `0002_mostrador.sql:28` es el único bloqueo duro. `cantidad` y `stock` ya son `numeric(12,3)`, así que media docena no exige columna nueva. El precio es por unidad comercial, no necesita conversión.
**Lo que falta del lado cliente:** Flutter sólo acepta cantidad entera (`carrito_controller.dart:80`, `pedido_pendiente.dart:68`) — sin aflojar eso, "kg" sigue sin poder venderse en fracción desde el teléfono.

### ADR-6 · El shell PL es un segundo shell, no una refactorización del primero
**Decisión:** `lib/features/pl/pl_shell.dart` con `NavigationBar` de 4 destinos que **importa los panes existentes**, y una rama `/pl` elegida en `_rutaInicial` (`app_router.dart:55-59`, hoy sólo mira `Rol`).
**Por qué:** la navegación del shell mayorista es estado en memoria (`adaptive_shell.dart:251`, `_seleccionar` en `:275-281`), no rutas; tocarlo para meter un modo compacto rompería `test/public_links_test.dart:180`, `integration_test/e2e_sesion.dart:92-93` (claves `nav_grupo_*`/`nav_item_*`) y el gate legal (`legal_gate.dart:32`, hoy sólo corre para admin). Superficie estimada: **4-6 archivos nuevos, 5-7 modificados**.
**Regla:** el shell elige la UI según lo que dice el servidor, pero cada endpoint vuelve a comprobar la capacidad. Que el botón no exista no es autorización — hoy es la **única** barrera cliente.

### ADR-7 · `mercado_flutter` no se toca
El cargador es un rol de Mercado al Toque; su asignación, retiro y tarifas siguen en el backend canónico. La app de compradores no gana nada con el PL.

---

## 4. Matriz reutilizar / adaptar / crear

| capacidad PL | decisión | dónde | bloqueo o nota |
|---|---|---|---|
| `catalog.read` / `write_limited` | **reutilizar** | `productos.ts`, `products_pane.dart` | el límite de edición se hace con `allow()`, no ocultando campos |
| `pricing.write` inline | **adaptar** | hoy el precio se edita en diálogo (`producto_form_dialog.dart:329`) | nada en el contrato lo impide |
| `stock.adjust_limited` | **reutilizar** | `ajuste_stock_dialog.dart:16` + `stock.ts` | resuelto en F0.5-3: `POST /stock/ajuste` (`$.ts:734`) acepta `clientUuid` y es idempotente (`2c299cb` + cliente `e4d76f3`) |
| `market.publish` por producto | **crear** | `productos.publicado_online` existe (`0009_mercado.sql:2`) | no hay "pausado" ni "agotado"; el cliente lo infiere hoy |
| `orders.read` con canal | **adaptar** | `ColaPedidos`, `pedidos_pane.dart:19` | `/pedidos` no devuelve `canal` ni `pagoEstado`; hay que ampliar el select |
| `sales.quick_checkout` | **adaptar** | `VentaDirectaDialog` (570 líneas) | **estaba muerto**: sin instancia en todo `lib/`; conectado en esta sesión (§7) |
| `cash.basic` | **adaptar** | `caja_pane.dart`, `CajaEstadoPane`, `EgresosPane` | `caja.ts:42-45,117` suma todos los medios → arqueo inflado |
| `payments.transfer` verificado | **crear** | `mercado.ts:666,715` escribe `informado` | `pago_estado` no tiene CHECK (`0009_mercado.sql:7`); desde `392e10c` la barrera de `app/` mira `pedidos.estado = 'cobrado'` y no `pago_estado`, así que el campo quedó sin leer como autorización en la API canónica mientras repoweb sí lo usa (`mercado/reglas.ts:94`) |
| `courier.pickup` | **reutilizar** | `mercado.ts:973,1114,1151` | la tarifa del cargador no está modelada (`presencia.ts:64` es comisión del puesto) |
| `identity.manage` | **adaptar** | `marca.ts:26-45` son 5 campos | CBU/prioridad/horarios no existen por puesto; el CBU es global de Torre (`repoweb/migrations/0017:4`) |
| `qr.view` | **reutilizar** | `qr_pane.dart:11` | — |
| `subscription.view` | **adaptar** | `suscripcion_pane.dart:12` | es `assertAdmin`; para ver "mi plan" sin ser admin hace falta el slice de `/session` |
| `marketing.addons.view` | **reutilizar** | `marketing_pane.dart:13` + catálogo Torre | push **no** entra por plan: requiere opt-in del destinatario y límites de frecuencia |
| Plan `mostrador_productor_local` ARS 50.000 | **crear** | migración aditiva `app/migrations/00XX_plan_productor_local.sql` | `0020_catalogo_comercial.sql:142` fija los planes de referencia en **USD**; el PL es el primer plan ARS con `features` |
| `advanced_inventory`, `suppliers`, `remitos_ocr`, `accounts_receivable`, `advanced_analytics`, `branches.multi`, `arca`, `advanced_cash` | **crear el gate** | ~35 rutas en `app/src/routes/api/v1/$.ts` (remitos `:748-807`, proveedores `:812-857`, CC `:585,611` y `:550,559`, ARCA `:1207-1268`, caja avanzada `:1044-1085`, sucursales `:927-963`, reportes `:1025-1039,1092-1202`) | hoy **sólo miran el rol**; sin esto la matriz §9 "PL intenta remitos o ARCA → 403" es falsa |

---

## 5. Cuatro correcciones a premisas de la especificación

Estas son las que cambian el plan. Tres las encontraron los agentes y las cuatro las verifiqué leyendo el código.

**5.1 La barrera de pago no existía (§1 y §5C piden "preservarla").**
`mercado.ts:1011` y `:1180` habilitaban el retiro con `estado in ('listo','cobrado')`. `pedidos.ts:88-96` ponía `pago_estado = 'habilitado'` en cuanto el staff marcaba `en_preparacion` o `listo`, sin ningún cobro. Camino real entonces: puesto marca listo → cargador retira → la transferencia nunca se acreditó. Es **más grave** de lo que la spec supone, y toca al mayorista actual, no sólo al PL. **Cerrado en F0.5-1 sobre `/api/v1`** (`392e10c`): `pedidos.ts` ya no toca `pago_estado`, `/retirar` exige `pedido_estado === 'cobrado'` (`mercado.ts:1184`) y responde `400 payment_not_confirmed`.

**Queda abierto del lado repoweb, y no es cosmético.** Los dos backends comparten la misma Neon DEV con reglas distintas: `repoweb/src/lib/fn.ts:763-770` sigue poniendo `pago_estado = 'habilitado'` al marcar `en_preparacion`/`listo`, su `updatePedidoEstado` no tiene whitelist de transiciones así que un cajero desde la web puede escribir `estado = 'cobrado'` **sin registrar ningún cobro**, y el retiro del cargador web (`repoweb/src/lib/mercado/servicio.ts:1160`, ruteado en `mercado/http.ts:205`) sigue aceptando `listo` **o** `cobrado`. Como la barrera de `app/` lee `pedidos.estado`, ese `cobrado` puesto a mano desde la web libera el retiro en el Flutter: la barrera vale para quien opera la API canónica, no para el puesto que usa la web. Alinearlo es cambio de regla en otro frente sobre archivos que el dueño tiene sucios (§8) — **requiere su decisión, no se ejecuta solo**.

**5.2 Las unidades no faltan (§4/§7 las creen inexistentes).**
`docena`, `atado`, `cajón`, `bolsa`, `"10 kg"` y `"maple 30"` ya se muestran vía `unidad_label` en la semilla de catálogo. El trabajo es 1 CHECK + 3 contadores + 2 enums + aflojar la cantidad entera en Flutter. No hay "auditar modelos" que valga un rediseño.

**5.3 La cola offline no es incompleta: es inexistente en caja (§6 la cree parcial).**
`offline_queue_service.dart:14` sólo encola pedidos del vendedor; caja no encola nada. Y hasta hoy el reintento generaba `clientUuid` nuevo en cada intento (`venta_directa_dialog.dart:111`), o sea **duplicaba la venta ante un timeout**. Corregido (`39d2931` el diálogo, `e4d76f3` el resto de las altas).

**5.4 El 92/96 de `docs/auditoria-web-vs-flutter.md:25` no es reproducible ni actual.**
No hay script que haga el diff de contratos (lo confirmé: `e2e-api-v1.mjs` prueba comportamiento, no cobertura). En HEAD hay 113 entradas `path:`, menos 15 de `/portal/*` → **98 relevantes**, no 96; las dos extra son `POST /creativos/:id/enviar` y `DELETE /creativos/:id`, entradas en `bf77daa` después del informe. La cifra sigue siendo cualitativamente correcta (`lib/services/` cubre los 29 grupos no-portal), pero no se cite como métrica viva.

---

## 6. Plan por fases (con criterios de salida)

**Fase 0.5 — cuatro fixes previos, ajenos al PL** *(nuevo; no estaba en la spec)*
1. ✅ Retiro gated por pago real: `mercado.ts:1011,1180` deben exigir `pago_estado = 'habilitado'` **y** que el habilitado lo haya puesto un cobro, no un cambio de estado; quitar el `→'habilitado'` automático de `pedidos.ts:88-96`. *(`392e10c`)*
2. ✅ Arqueo por medio: `caja.ts:42-45` y `:117` separan `efectivo` del resto; `esperadoEnCaja` es sólo efectivo y el cierre prellena `real` con esa cifra. *(`8598948`, reglas puras en `caja-reglas.ts`)*
3. ✅ Idempotencia de `POST /stock/ajuste`, egresos y remitos (`clientUuid`). *(servidor `2c299cb` + migración `0038`; clientes `e4d76f3`)*
4. ⛔ Gate de plan en los ~35 endpoints listados en §4, con tests 403 por capacidad. **Sin empezar:** el mecanismo (`entitlements.ts` + `allow()`) se define en Fase 1, y gatear ahora por líneas de suscripción de Torre dejaría en 403 a los tenants de DEV/e2e, que no tienen líneas. Hay que decidir primero el modelo de `features` del plan.
**Salida:** matriz §9 de la spec en verde para los casos de pago, arqueo y escalamiento — con puestos mayoristas ya existentes, sin tocar el PL.

**Fase 1 — licenciamiento.** Migración aditiva del plan + `features`; `entitlements.ts` + `allow()`; `businessProfile`/`capabilities` en `/session`; contrato en `docs/api-v1.md` y `openapi-v1.yaml`. **Salida:** tests de plan vencido, `past_due`, add-on con `ends_on` vencido, suscripción cross-tenant y escalamiento por JSON de sesión.

**Fase 2 — dominio PL.** `agotado`/`pausado` como estado explícito; `canal` y `pagoEstado` en `/pedidos`; CBU/horarios por puesto; equivalencias de unidad; cantidad fraccionable en Flutter. **Salida:** e2e comprador + PL + cargador con transferencia informada y confirmada, presencial en efectivo y en transferencia, rechazo y reinicio.

**Fase 3 — shell PL.** `pl_shell.dart` + `/pl` en `_rutaInicial` + 4 tabs; tests widget de las dos rutas (PL compacta, mayorista intacta). **Salida:** `flutter analyze` en 0 issues, suite verde, build Android de prueba sin publicar.

**Fase 4 — piloto.** Tenant PL de prueba, 5 productos de unidades distintas, publicidad deshabilitada/habilitada. **Salida:** criterios de negocio medidos antes de ofrecer el plan.

---

## 7. Cambios hechos en esta sesión (fuera del PL)

Responden a la queja «en el celu no se puede hacer nada ni cobrar», verificada en el emulador: la Caja del teléfono mostraba «No hay pedidos con este filtro» sin ninguna salida.

- `clients/puesto_flutter/lib/features/caja/caja_pane.dart` — se conecta `VentaDirectaDialog` (570 líneas que ningún widget instanciaba): botón `caja_nueva_venta` en la barra de pedidos y `caja_vacio_nueva_venta` en el estado vacío, con el ticket detrás del cobro.
- `clients/puesto_flutter/lib/features/caja/venta_directa_dialog.dart` — `clientUuid` fijo por diálogo (`_clientUuid`) en lugar de generarlo en cada intento.

Ambos se commitearon en `39d2931` con `flutter analyze` en 0 issues y `flutter test` en verde, y entraron en el APK/instalador del Escritorio reconstruido desde `main`.

---

## 8. Bloqueos y advertencias de entorno

- **Dueño de `torre.*` dividido.** `app/migrations` llega a `0037` y `repoweb/migrations` a `0050`, ambas sobre la misma Neon DEV, con runner propio compartido (`app/scripts/migrate.mjs`, clave = basename). Antes de crear el plan hay que fijar en qué repo vive la migración; si no, el mismo `insert` puede aplicarse dos veces desde dos lugares.
- **Árbol sucio con trabajo de otra mano.** Sin commitear: `app/src/lib/server/cupo-plans.ts` (+ su test), `app/src/lib/server/usuarios.ts`, `repoweb/src/lib/torre/central-http.ts`, `repoweb/src/lib/torre/movil-registro.ts`, `torre_flutter/**`, `clients/mercado_flutter/lib/screens/cart_screen.dart` y `integration_test/canal_flow_test.dart`. `cupo-plans.ts` es justamente cupo de usuarios por plan: **la Fase 1 pisa ahí**. Nada de esto se comitea ni se revierte sin instrucción.
- **`repoweb/migrations/0050_ops_observabilidad.sql` sin commitear.** Cualquier deploy hecho desde el directorio de trabajo (en vez de un worktree limpio de `origin/main`) crearía `torre.ops_event` en la DEV compartida.
- **La web y la API públicas siguen en `0454d49`** (08/11 19:31), 22 commits detrás de `main`. Los APK/`.exe` del Escritorio se compilaron de `1ff9336`, así que hoy van **por delante** de la web. Publicar `main` es seguro y aditivo (cero migraciones pendientes en `app/`, cero variables nuevas), pero requiere autorización explícita del usuario.
