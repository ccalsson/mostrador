# Auditoría comparativa: Mostrador Web vs. Flutter

**Fecha:** 2026-11-09
**Alcance:** aplicación web del Puesto (`app/`) vs. cliente Flutter (`clients/puesto_flutter/`)
**Estado:** ⚠️ **Esta versión corrige un informe anterior que era materialmente inexacto.** Ver §0.

---

## 0. Corrección de un informe previo

El 2026-10-21 se emitió en este mismo archivo un informe que estimaba la paridad en **~65%** y listaba ~18 funcionalidades como `AUSENTE`. **Esa conclusión era falsa.**

**Causa del error:** el inventario de archivos Dart se obtuvo con `find … | head -100`. El proyecto tiene **151** archivos `.dart` en `lib/`. Todo lo alfabéticamente posterior al corte de 100 líneas fue invisible para el análisis — entre ello `egresos_pane.dart`, `escritorio_pane.dart`, `mensajes_tab.dart`, `sucursales_pane.dart`, `identidad_pane.dart`, `marketing_pane.dart`, `offline_queue_service.dart`, `legal_gate.dart`, `facturacion_pane.dart` y `clima_dolar_widget.dart`.

**Segundo problema de método:** se audito el ZIP `version full/` como si fuera la referencia vigente. Es un snapshot **anterior** del proyecto; el código web actual es `app/`. Varios módulos que el ZIP tenía como rutas separadas hoy son pestañas, y Flutter evolucionó por delante de lo que el ZIP registra (commits `0454d49` reordenar catálogo, `6bcbe48` canal Mercado).

**Lo que el informe anterior marcó `AUSENTE y que ya existe en Flutter:** egresos de caja, costos y márgenes, escritorio del dueño, chat de pedidos, sucursales, identidad del puesto, mesa de turno, clima y dólar, puerta legal, cola offline, checklist de entrega, facturación ARCA, impresión térmica, canal Mercado, clientes de la app, marketing/creativos IA, cambiar clave de usuario.

El método correcto, usado acá, es comparar **contratos de API** en lugar de listar archivos: el conjunto de endpoints del backend contra el conjunto de endpoints que Flutter invoca. Un diff de conjuntos no se trunca.

---

## 1. Resumen ejecutivo

**Paridad real: 92 de 96 endpoints (96%).**

El backend expone **111** rutas en `/api/v1`; restadas las **15** de `/portal/*` —que pertenecen a la app de clientes, no al Puesto— quedan **96** relevantes. Flutter invoca **92** de ellas, incluidas las de mayor peso: facturación ARCA, mensajería, sucursales, egresos, costos masivos, creativos IA, escritorio, mesa de turno, marca, cola offline y checklist de entrega.

No hay ningún módulo funcional ausente. Los 4 endpoints restantes no son huecos de producto: uno es redundante, uno es una duda de exactitud financiera y **dos son el síntoma visible de un bug real** (§4).

La tarea de paridad ya no es "trasladar módulos web a Flutter". Eso está hecho. Lo que queda es un bug con botones que devuelven 404, una elección de tasa de dólar mal resuelta y un permiso de sucursal sin UI.

---

## 2. Inventario verificado

### 2.1 Backend (`app/src/routes/api/v1/$.ts`) — 111 rutas

Handler único `catch-all` con tabla `ROUTES: Entry[]`. El contrato documentado está en `app/docs/api-v1.md`.

Grupos: `session`, `catalogo`, `cotizacion`, `pedidos*` (11 variantes), `cobros*`, `clientes*`, `productos*`, `stock`, `remitos*` (8), `proveedores*`, `usuarios*`, `sucursales*`, `caja*`, `egresos*`, `escritorio`, `mesa-turno`, `marca`, `canal-mercado`, `alertas*`, `auditoria`, `dashboard`, `reportes*`, `cargadores`, `reposicion`, `checklist*`, `compradores-app*`, `mensajes*`, `creativos`, `afip*` (8), `suscripcion*` y `portal*` (15).

### 2.2 Flutter (`clients/puesto_flutter/lib/`) — 151 archivos `.dart`

| Capa | Cant. | Detalle |
|------|-------|---------|
| `services/` | 40 | un archivo por dominio, todos sobre `ApiClient` |
| `models/` | 32 | incluyendo `egreso`, `escritorio`, `marca`, `mesa_turno`, `sucursal`, `creativo`, `mensajes`, `checklist`, `facturacion`, `canal_mercado`, `comprador_app`, `reposicion`, `clima_dolar` |
| `features/admin/` | 36 | 20 paneles + controladores y diálogos |
| `features/caja/` | 16 | incluye `egresos_pane`, `entrega_pane`, `venta_directa_dialog` |
| `features/pedidos/` | 7 | incluye `checklist_pane`, `cola_pedidos`, `pedido_mensajes_pane` |
| `features/shell/` | 5 | incluye `legal_gate`, `mesa_turno_widget`, `clima_dolar_widget` |

### 2.3 Roles y navegación

`app_router.dart` define `/session`, `/login`, `/vendedor`, `/vendedor/pedido/:id`, `/caja`, `/admin`. Redirect por rol en `_rutaInicial()`. `adaptive_shell.dart` arma las pestañas por rol (admin: 20 destinos). Coincide con la navegación de `AppShell` en la web.

---

## 3. Diff de endpoints (backend ∖ Flutter)

Ocho rutas del backend no son invocadas por Flutter. Tras verificarlas una por una:

| Endpoint | Veredicto | Motivo |
|----------|-----------|--------|
| `POST /sucursales/:id/usar` | ✅ Cubierto | Llamado real en `sucursales_service.dart:34`; el diff lo perdía por anidamiento `${…}` |
| `POST /sucursales/:id/transferir` | ✅ Cubierto | `sucursales_service.dart:44` |
| `POST /sucursales/:id/importar-clientes` | ✅ Cubierto | `sucursales_service.dart:51` |
| `GET /productos` | 🔵 Redundante | `handler` → `listProductosForStaff`. Flutter usa `/catalogo`, que ya incluye inactivos (`productos_pane` muestra chip "Inactivo"). Sin pérdida funcional |
| `POST /productos/:id/foto` | ✅ Cubierto | `productos_service.dart:102` |
| `GET /pedidos/:id/comprobante` | ✅ Cubierto | `pedidos_service.dart:144` vía `getBytes` |
| `GET /cotizacion` | 🟡 **Brecha real** | Ver §4.2 |
| `POST /usuarios/:id/cambio-sucursal` | 🟠 **Brecha real** | Ver §4.3 |

## 3.bis Diff inverso (Flutter ∖ backend) — **BUG**

Flutter llama dos rutas **que no existen en el backend**:

| Llamado desde Flutter | Backend |
|----------------------|---------|
| `POST /api/v1/creativos/$id/enviar` (`creativos_service.dart:42`) | ❌ inexistente |
| `DELETE /api/v1/creativos/$id` (`creativos_service.dart:47`) | ❌ inexistente |

Confirmado sobre `app/src/routes/api/v1/$.ts`: sólo hay dos entradas con `path: ["creativos"]` (líneas 969 `GET` y 974 `POST`), ambas sin segmentos adicionales. No hay manejo de sufijo.

---

## 4. Diferencias confirmadas

### 4.1 Bug en Marketing/Creativos — prioridad ALTA

`lib/features/admin/marketing_pane.dart` cablea botones reales a los dos servicios inexistentes:

- `_enviar()` (línea 54) → `creativosServiceProvider.enviar(pedido.id)` → `POST /creativos/:id/enviar`
- `_borrar()` (línea 69) → `.borrar(pedido.id)` → `DELETE /creativos/:id`
- Botones con claves de test `creativo_enviar_${id}` (línea 403) y `creativo_borrar_${id}` (línea 409)

Ambos pulsan sobre endpoints que devuelven 404. El botón "borrar" muestra en su propio docstring "Gasta crédito de IA", o sea que promete un efecto contable que no ocurre.

**Dependencia:** arreglarlo requiere una decisión de arquitectura (§7, pregunta 1). La opción correcta según `app/AGENTS.md` es agregar las dos rutas al backend extrayendo antes el caso de uso compartido —no implementar la lógica en Flutter.

### 4.2 Cotización: dólar blue vs. oficial — prioridad MEDIA

`lib/services/clima_dolar_service.dart:13` consulta `https://dolarapi.com/v1/dolares/blue` **directamente desde el cliente**, saltándose el backend. El backend expone `GET /api/v1/cotizacion` → `{ usd_ars }` con `getCotizacion()`, que es la tasa **oficial** con la que el ERP convierte precios.

Dos problemas: (a) viola el invariante de que los datos de negocio vienen del backend; (b) el encabezado muestra una tasa distinta de la usada para facturar, lo que en un puesto que fija precios en USD y cobra en ARS inducen a error. No es estético.

### 4.3 Permiso de cambio de sucursal sin UI — prioridad MEDIA

El backend autoriza `POST /api/v1/usuarios/:id/cambio-sucursal` (`{ puedeCambiar }`) y la sesión ya devuelve `puedeCambiar` por staff. El `puedeCambiar` que hoy se muestra en el shell es siempre el del usuario logueado: **el dueño no tiene dónde habilitar ni revocar el permiso a su equipo.** Flutter sí implementa el otro extremo (`/sucursales/:id/usar`), de modo que el flujo está a la mitad.

### 4.4 Diferencias de forma, no de función (registradas, sin acción)

| Aspecto | Web | Flutter |
|---------|-----|---------|
| Gráficos | Recharts en `dashboard.tsx` | numéricos, mismos datos de `/dashboard` |
| Reordenar catálogo | drag-and-drop | flechas arriba/abajo (`0454d49`) |
| Impresión térmica | Web Bluetooth/WebUSB | `impresion_termica_service.dart` + diálogo del sistema |
| Cola offline | `localStorage` | `offline_queue_service.dart` persistente |

Son adaptaciones legítimas de plataforma. No requieren trabajo.

---

## 5. No tocar

Funciona y está verificado a nivel de contrato. El mandato de la tarea original —"no gastar trabajo en lo ya completo"— aplica sobre el 96% restante.

Autenticación y sesión · catálogo con ETag/`?since` · alta/edición/baja y reorden de productos · fotos de producto · costo unitario y **margen masivo** (`PATCH /productos/batch-costos`) · importación de costos desde remito · stock (ajuste/merma/reposición) · alertas · clientes y cuenta corriente · compradores de la app · proveedores · remitos con OCR y confirmación · usuarios y cambio de clave · **sucursales** (crear, usar, transferir, importar clientes) · **egresos** de turno con anulación · caja, cobro de 4 formas, anulación de venta y pedido · **cierre de caja** · **escritorio del dueño** · **mesa de turno** · **identidad del puesto** (`/marca`) · **puerta legal** · **mensajería de pedidos y bandeja** · **checklist de entrega** con entrega parcial · **venta directa** · tickets PDF e impresión · **facturación ARCA/AFIP** (config, prueba, emisión, notas de crédito, detalle con QR) · **marketing y creativos IA** · reportes e historial · ranking de cargadores · auditoría · suscripción y contratos · clima · tema claro/oscuro.

---

## 6. Riesgos técnicos

1. **`app/` tiene trabajo sin commitear del usuario.** `git status` marca modificados `app/src/lib/server/mercado.ts` y `app/src/lib/torre/presencia.ts`, más `clients/mercado_flutter/` y 8 worktrees activos. **No** conviene delegar cambios de backend a un agente en paralelo: riesgo de pisar trabajo ajeno. El invariante de `app/AGENTS.md` ("extraer primero el caso de uso compartido desde `fn.ts`") hace que el fix de §4.1 no sea una edición de una línea.

2. **El ZIP `version full/` no debe usarse como referencia.** Es anterior al estado actual. La referencia vigente es `app/`.

3. **`mercado_flutter` es una app distinta** de `puesto_flutter`. Su carpeta tiene modificaciones propias del usuario; queda fuera de este alcance.

4. Verificado sólo por lectura de código y diff de contratos. **No se ejecutaron tests ni servidores** en esta auditoría.

---

## 7. Dudas que requieren tu decisión

*(Respondidas al cerrar los lotes: ver §9.)*

1. **§4.1 (creativos 404):** ¿agrego las dos rutas al backend (`POST /creativos/:id/enviar`, `DELETE /creativos/:id`) siguiendo el patrón `*ForStaff` de `app/src/lib/server/creativos.ts`, o oculto los botones en Flutter hasta que exista el backend? La primera requiere tocar `app/` con el árbol sucio.

2. **§4.2 (dólar):** ¿el widget debe mostrar la tasa **oficial** del backend, o se quiere conservar la **blue** como referencia de mercado a propósito? Si es "ambas", hay que rotularlas explícitamente.

3. **§4.3 (cambio de sucursal):** ¿el control va como switch en la fila de `usuarios_pane` junto al de activo/inactivo, o dentro del diálogo de edición del usuario?

4. ¿Existe algún otro punto de paridad que te interese medir por comportamiento de UI y no por contrato de API? Esta auditoría cubre el contrato; una revisión de paridad visual (layout, densidad de información) es un trabajo distinto.

---

## 8. Plan de implementación

Ordenado por riesgo creciente, no por prioridad de negocio.

**Lote 1 — Flutter puro, sin tocar backend.** *(en ejecución por subagentes al momento de esta versión del informe)*
- 1.1 `POST /usuarios/:id/cambio-sucursal`: servicio + switch en `usuarios_pane.dart`.
- 1.2 `GET /api/v1/cotizacion`: reemplazar la llamada directa a dolarapi por `ApiClient`.

**Lote 2 — Backend (necesita decisión §7.1).** Rutas de creativos en `app/src/routes/api/v1/$.ts` delegando en un caso de uso nuevo en `app/src/lib/server/creativos.ts`, más su entrada en `app/docs/api-v1.md`.

**Lote 3 — Verificación.** `flutter analyze`, `flutter test`, `flutter test integration_test -d windows` contra DEV, y pruebas e2e nuevas para los dos flujos del Lote 1.

Nada del Lote 1 o 2 exige migraciones SQL ni dependencias nuevas.

---

## 9. Cierre de los tres huecos

Los tres se resolvieron en `bf77daa`, con las respuestas que estaban abiertas en §7:

- **§4.1 creativos (ALTA).** Opción backend, no ocultar botones. `enviarCreativoForStaff` y `borrarCreativoForStaff` viven en `app/src/lib/server/creativos.ts` y el router los expone como `POST /creativos/:id/enviar` y `DELETE /creativos/:id`, ambas sólo para `admin`. El enviar acepta `borrador` o `listo` y devuelve 409 `creativo_ya_enviado` si ya salió; el borrar es **lógico** (`estado = 'eliminado'`) porque las variantes cuelgan de `creativos_pedidos` sin cascade y los créditos gastados no vuelven al saldo. Un id que no es de la casa da 404, no 409, para no confirmar existencia ajena.
- **§4.2 dólar (MEDIA).** Tasa oficial del backend. El widget lee `GET /api/v1/cotizacion` —la misma conversión con la que el ERP factura— en vez de scrapear dolarapi.com desde el cliente; el rótulo dice "oficial" y un Tooltip explica que es la tasa de facturación.
- **§4.3 sucursal (MEDIA).** Switch en la fila de `usuarios_pane`, no en el diálogo; se esconde para el propio admin porque la ruta ya lo rechaza.

Tres cosas más que estaban rotas y se arreglaron en el mismo camino:

1. `reposicion_dias` la usaba `repoweb/src/lib/reposicion-fn.ts` pero nunca se migró desde `app/`: ahora existe `app/migrations/0036_premium_reposicion.sql`, byte a byte igual a la de repoweb. Como el registro de migraciones va por basename, en DEV se aplica una sola vez.
2. `app/docs/openapi-v1.yaml` **no parseaba** desde `1f4eac9`: dos `description` sin comillas llevaban `: ` dentro del texto. Corregidos, y agregadas las dos operaciones de creativos que faltaban (`/creativos/{id}/enviar`, `DELETE /creativos/{id}`) — el archivo declara ser fuente de verdad del router y sólo se amplía.
3. §3.bis queda desactualizado adentro de este mismo doc: las dos rutas que marca `❌ inexistente` ya existen. Se deja el texto original porque es la evidencia del bug, no el estado vigente.

**Verificación (no lectura de código):** `npm run typecheck` y `npm test` en `app/`, `npm run typecheck` en `repoweb/`, `flutter analyze` y `flutter test` en las dos apps Flutter, y la suite `npm run test:e2e` contra Neon DEV: **38 de 39 verdes**. Adentro del test 27 están las aserciones nuevas de los dos endpoints (enviar, 409 de reenvío, 404 cross-tenant, 403 de vendedor y cajero, borrado lógico con la fila intacta y las dos acciones en `auditoria`); la siembra del pedido se hace por SQL para que la cobertura no dependa de las llaves del proveedor de IA.

El test de `foto de producto` estaba rojo por un error del propio test, no del backend: creaba el producto mandando `id` en el body, y en `POST /api/v1/productos` un `id` es la señal de "editar uno que ya existe" (`saveProductoForStaff` hace `update` sobre una fila inexistente y responde 201 sin escribir nada). Ahora toma el id que devuelve el alta.

**El único rojo que queda (test 20, ARCA) es de datos, no de código:** `POST /afip/config` sin PEMs en el cuerpo cae al `cert_pem` ya almacenado en la fila de `frutas-roman` en Neon DEV, y node-forge no lo parsea (`Invalid PEM formatted message`). Arreglarlo implica tocar material de certificado de un entorno compartido, así que queda a decisión del usuario.

*Fin.*
