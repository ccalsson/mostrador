# Matriz de paridad funcional Web + Flutter (P0)

**Mandato:** convergencia funcional total — un solo producto con dos clientes equivalentes.
**Fecha:** 2026-10-10 · **Rama:** `convergence/p0-backend-authz`
**Método:** 4 inventarios verificados contra código real (no por pantalla/endpoint/test aislado): repoweb (43 rutas, 128 server fns), backend canónico `app/` (76 rutas /api/v1 + ~40 /api/mercado/v1), `clients/puesto_flutter` (cero condicionales de plataforma), `clients/mercado_flutter`. Cada celda cita evidencia `archivo:línea` cuando aporta.

## 0. Decisiones de alcance cerradas (con el usuario, 2026-10-09)

1. **Web = repoweb como frontend puro** sobre `/api/v1` + `/api/mercado/v1` de `app/`. Better Auth de repoweb se jubila para Mostrador/Mercado (auth unifica a la de `app/`).
2. **Portal del cliente: queda web** + integración con Mercado. No se duplica en Flutter (los clientes no usan la app del puesto).
3. **Extras aprobados:** Publicidad/Push, ARCA UI en Flutter, Torre escritorio Windows (mandato maestro Torre: stack repoweb, Electron + adaptador central — ver `torre-legal-integracion`).
4. Diferencias de plataforma permitidas (§5 del mandato) sin eliminar funcionalidad de negocio.
5. La web interna de `app/` (RPC `fn.ts`) queda como referencia/dev; el producto web es repoweb.

**Hecho estructural:** `puesto_flutter` no tiene NI UN condicional de plataforma (`Platform.is*`/`kIsWeb`: 0 resultados) → Windows ≡ Android salvo empaquetado. La columna Win/Android solo difiere donde lo indico.

## 1. Resumen ejecutivo

- **Backend `app/` cubre casi todo el dominio**: proveedores, ARCA, reportes/ranking, portal, chat REST, legal A.1–A.4 y OCR ya tienen HTTP (corrige hipótesis previas). Sin REST quedan: WebSocket de chat (REST sí existe), B.4 historial legal de Mercado (opcional, `suscripcion-legal-propuesta.md:229`) y gestión Torre (vive en repoweb por mandato maestro).
- **repoweb duplica backend localmente**: 128 server fns con SQL directo + 3 APIs locales (`central-http.ts`, `mercado/http.ts`, Better Auth propio) que deben jubilarse y apuntar a `app/`.
- **puesto_flutter** tiene el núcleo ERP sólido; le faltan 12 funcionalidades (tabla M).
- **mercado_flutter** tiene el ciclo comprador+cargador completo; le faltan 5 funcionalidades (tabla C). Paridad inversa: el canal web Mercado tiene ranking/avisos que la app no.
- **Gap de seguridad heredado (hallazgo B)**: `central-http.ts` de repoweb no chequea rol del staff — un vendedor puede leer suscripción y aceptar contratos. Es el primer ítem de trabajo (A0).

## 2. Matriz Módulo Mostrador (ERP)

Columnas: **Web** = repoweb actual · **Win/And** = puesto_flutter (código compartido salvo nota) · **Backend** = `app/` · **Prueba** = aceptación comparativa.

| # | Funcionalidad | Web | Win | And | Backend | Diferencia | Trabajo necesario | Prueba de aceptación |
|---|---|---|---|---|---|---|---|---|
| M1 | Login staff | `login.tsx` (Google/X vía `/api/auth/*`) | ✓ `login_screen` | ✓ | `/api/auth/*` ✓ | Web proxy enruta auth a `app/`; OAuth requiere credenciales configuradas por entorno y aceptación integrada | A1 parcial: OAuth Google/X en `app/`, proxy de auth web y cookie común; validar callback, sesión, logout, Torre y roles en despliegue | Login de los 3 roles en web y Flutter contra el mismo backend |
| M2 | Recuperación contraseña staff | `recuperar.tsx` + `reset-password.tsx` | ✗ | ✗ | forget/reset Better Auth ✓ (link a consola, sin SMTP; `server.ts:116-126`) | Falta UI Flutter; sin entrega real de email en ningún cliente | B9: UI recuperación en Flutter; SMTP = decisión de producto (ver §5) | Recuperar desde Flutter cambia la contraseña y permite reingresar |
| M3 | Alta de puesto/tenant | `registro.tsx` (SQL local repoweb) | ✗ | ✗ | ✗ (solo seed DEV; "primer dueño a mano" en prod) | La lógica de alta vive fuera del backend canónico | Nuevo endpoint en `app/` o manual prod — **backend nuevo, decidir (§5)** | Crear puesto desde web deja tenant+dueño operativos |
| M4 | Sesión/roles en UI | `quienSoy` + guards | píldoras por rol; router NO valida rol por URL (`app_router.dart:20-31`) | ≡ | `GET session` ✓ | Router Flutter deja renderizar `/admin` a un vendedor (el 403 del backend cubre) | Opcional: guard por rol en router | Vendedor en `/admin` ve 403s del backend, sin datos |
| M5 | Productos alta/edición/baja | `saveProducto`/`quitarProducto` (admin, audita precio) | ✓ `productos_service:51-62` | ≡ | ✓ | Paridad | — | Cambio de precio auditable idéntico en ambos |
| M6 | Reordenar catálogo | `ordenarProductos` (admin) | ✗ | ✗ | ✓ | Falta en Flutter | B10: UI reordenar | Orden persiste tras recargar en ambas |
| M7 | Stock ajuste/merma | `ajustarStock` | ✓ `POST stock/ajuste` | ≡ | ✓ | Paridad | — | Movimiento `ajuste`/`merma` auditado en ambos |
| M8 | Alertas stock | list + marcar leída | ✓ `alertas_service:14-22` | ≡ | ✓ | Paridad (umbral se edita en el producto en ambos) | — | Alerta al cruzar mínimo visible en ambos |
| M9 | Alta pedido idempotente | `crearPedido` + cola offline `localStorage` (`vendedor.tsx:10-11`) | ✓ `clientUuid` | ≡ | ✓ | Web tiene outbox; Flutter no persiste pendientes | B11: outbox persistente Android | Mismo `clientUuid` en reintento = 1 solo pedido, en ambos |
| M10 | Transición en_preparacion→listo | `updatePedidoEstado` (admin/cajero, `caja.tsx`) | ✓ `caja_marcar_listo` | ≡ | `POST pedidos/:id/estado` ✓ | Flutter marca listo desde Caja; backend valida la transición, Flutter relee detalle/lista y muestra errores canónicos | B3 implementado; smoke Web↔API↔Flutter pendiente | Pedido Mercado/ERP pasa a "listo" desde ambas UIs |
| M11 | Entregar pedido | `marcarEntregado` (solo cobrado) | ✓ `POST entregar` | ≡ | ✓ | Paridad | — | Rechazo si no cobrado, igual en ambos |
| M12 | Editar ítems pedido | `updatePedidoItems` (rearma reserva) | ✓ `editar_items_dialog` | ≡ | ✓ | Paridad | — | Reserva liberada/recreada idéntica |
| M13 | Anular pedido | `anularPedido` (bloquea si factura electrónica) | ✓ `caja_anular_pedido` | ≡ | `POST pedidos/:id/anular` ✓ | Flutter pide motivo y muestra el error canónico; disponible para pedidos aún no cobrados | B1a implementado; smoke Web↔API↔Flutter pendiente | Anulado libera reserva; bloquea con factura, igual en ambos |
| M14 | Cobro (vuelto, CC plan Pro, stock, numera ticket) | `cobrarPedido` idempotente | ✓ `cobro_dialog` | ≡ | ✓ | Paridad | — | Vuelto y asiento CC idénticos contra mismos datos |
| M15 | Anular cobro | `anularCobro` (reintegra stock + reverso CC) | ✓ `caja_anular_cobro_*` | ≡ | `POST cobros/:/anular` ✓ | Flutter pide motivo y backend realiza reintegro/reverso; si tiene factura electrónica, aún requiere completar nota de crédito desde Web (B7) | B1b implementado; smoke Web↔API↔Flutter pendiente | Reintegro visible en stock y cuenta, igual en ambos |
| M16 | Cierre de caja | `estadoCaja`/`cerrarCaja` (diferencia y alerta) | ✓ `caja_estado_pane`+`cierre_dialog` | ≡ | ✓ | Paridad | — | Misma diferencia calculada por backend en ambos |
| M17 | Ticket | `ticket.$cobroId.tsx` + térmica Web Bluetooth/USB | PDF 80mm + diálogo sistema (`ticket_pdf.dart:13-91`) | ≡ | `GET cobros/:/ticket` ✓ | Térmica directa solo web; Flutter usa diálogo del SO (diferencia de plataforma permitida) | Adaptador térmico cuando se conozca hardware | Mismo ticket imprimible en ambos |
| M18 | Clientes alta | `createCliente` (valida plan Pro CC) | ✓ | ≡ | ✓ | Paridad | — | Rechazo CC sin plan Pro igual en ambos |
| M19 | Editar cliente | `guardarCliente` (`portal-fn.ts:447`) | ✗ | ✓ ficha editable completa | `POST clientes/:id` ✓ | Flutter actualiza nombre, teléfono, CUIT/DNI, dirección, condición IVA, cuenta corriente y activo; errores canónicos visibles | B2a implementado; smoke Web↔API↔Flutter pendiente | Cambios auditables idénticos |
| M20 | Cuenta corriente + pagos | `anotarPagoCuenta`/`movimientosCliente` | cuenta solo lectura | ✓ saldo/movimientos + registro de pago | `GET cuenta` + `POST pagos` ✓ | Flutter registra monto y nota; refresca cuenta y saldo de clientes tras éxito | B2b implementado; smoke Web↔API↔Flutter pendiente | Saldo derivado correcto tras pago, igual en ambos |
| M21 | Remitos alta (csv/foto/manual/pdf + match) | Alta manual/foto; crea por `POST /api/v1/remitos` | ✗ | ✗ | `POST remitos` ✓ (fuentes) | Flutter aún no tiene alta | B5: alta con foto (Android `image_picker`, Windows `file_selector`) | Confirmación genera `entrada_remito`, igual en ambos |
| M22 | Remitos OCR | `parseRemitoVision` → `POST /api/v1/remitos/ocr` | ✗ | ✗ | `POST remitos/ocr` ✓ (fail-closed 503) | Falta OCR de remito en Flutter | B5: OCR compartido por API en ambas apps | Misma lectura revisable en web y Flutter |
| M23 | Remitos revisión/confirmación | Detalle, edición de líneas y confirmación por `/api/v1/remitos/*` | ✓ `remitos_service:12-41` | ≡ | ✓ | Paridad de reglas; web y Flutter usan el backend canónico | — | Solo confirmación humana suma stock, igual en ambos |
| M24 | Proveedores CRUD | ✓ panel CRUD + productos vía `/api/v1/proveedores*` | ✗ (solo nombre en texto del remito) | ✗ | GET/POST/update/productos ✓ | Panel de proveedores ausente en Flutter | B4: panel proveedores | CRUD auditable idéntico |
| M25 | Usuarios alta/toggle | list/create/toggle vía `/api/v1/usuarios*` | ✓ (sin edición, igual que web) | ≡ | ✓ | Web y Flutter delegan permisos y escritura al backend | — | Usuario creado entra por rol correcto en ambos |
| M26 | Auditoría | `listAuditoria` vía `/api/v1/auditoria` (admin) | ✓ sin filtros | ≡ | ✓ | Web y Flutter leen del backend canónico | — | Misma traza visible en ambos |
| M27 | Dashboard | `dashboardResumen` vía `/api/v1/dashboard` (admin), selector 1/7/30 días | ✓ selector 1/7/30 días | ≡ | ✓ | Web y Flutter leen del backend canónico | — | Mismos montos contra mismos datos |
| M28 | Reportes productos/historial | `resumenVentasProductos`/`historialProducto` vía `/api/v1/reportes/*` | ✗ | ✗ | `GET reportes/productos` + `/historial` ✓ | Falta en Flutter | B6a: reportes | Mismos totales por producto en ambos |
| M29 | Ranking de cargadores | `rankingCargadores` vía `/api/v1/cargadores/ranking` (admin) | ✗ | ✗ | `GET cargadores/ranking` ✓ | Falta en Flutter | B6b: panel ranking | Ranking consistente con datos de Mercado |
| M30 | ARCA/AFIP completo | ✓ 8 fns `afip-fn.ts` → `/api/v1/afip/*` + UI `arca.tsx`/`factura.$id.tsx` | ✗ | ✗ | `afip/*` 8 rutas ✓ (config admin; emisión admin+cajero) | UI entera ausente en Flutter (extra aprobado) | B7: paneles ARCA (config, habilitar, emitir, NC, listado, ver) | CAE y número idénticos emitiendo desde web o Flutter |
| M31 | Marca/canal Mercado (config) | ✓ Branding público `/api/tenant`; guardar marca/canal vía `/api/v1/marca` y `/canal-mercado` | ✓ solo lectura (`GET /api/tenant`) | ✓ solo lectura | `marca` + `canal-mercado` GET/POST ✓ | Flutter aún no tiene configuración admin | B10b: pantalla config | Marca persiste y se refleja en ambas apps |
| M32 | Mensajería de pedido | ✓ Chat y bandeja vía REST `/api/v1`; polling cada 4/8 s | ✗ | ✗ | REST ✓ (`pedidos/:/mensajes`, `conversaciones`, rutas de portal); WebSocket no disponible en producción | Web convergió al transporte REST canónico; falta chat en Flutter | B8: chat con polling (WS opcional) | Mensaje staff↔cliente visible en web y Flutter |
| M33 | Portal del cliente | ✓ `portal.tsx` y operaciones vía `/api/v1/portal/*`; comprobante de transferencia en Caja vía API | ✗ (por decisión §0.2) | ✗ | `portal/*` rutas ✓; comprobante staff expuesto bajo pedidos | Portal permanece web; reglas, identidad y datos viven en `app/` | A6: aceptación integrada Web↔API pendiente | Cliente ve catálogo/saldo/pedidos/comprobante desde web sobre `app/` |
| M34 | Suscripción/legal (A.1–A.4) | `contrato.tsx` → funciones protegidas → `/api/v1/suscripcion*` | ✓ `suscripcion_pane` (solo dueño) | ✗ (no aplica a staff no-admin: 403) | `GET/POST suscripcion*` ✓ | Resumen, capacidades, contrato, historial y aceptación pasan por el backend canónico; falta aceptación integrada en DEV | A8 implementado en código; validar aceptación, permisos y actualización tras aceptar | Aceptación autenticada en Web y Flutter contra el mismo contrato y datos |
| M35 | Torre (planes/tenants/suscripciones/finanzas/... ) | Panel completo: 20 páginas + 54 fns (`torre-fn`, `control-fn`, `legal-fn`) | ✗ | ✗ | `app/`: solo legal A/B; gestión Torre vive en repoweb (mandato maestro) | Torre = app escritorio nueva (extra aprobado) | H: Torre escritorio Windows sobre stack repoweb | e2e real dueño / vendedor-403 / aislamiento de tenant |

## 3. Matriz Módulo Mercado al Toque

| # | Funcionalidad | Web (`mercado.tsx`) | Flutter (mercado_flutter, Android) | Backend | Diferencia | Trabajo necesario | Prueba de aceptación |
|---|---|---|---|---|---|---|---|
| C1 | Registro comprador/cargador | ✓ (DNI/CI, `mercado.tsx:369`) | ✓ `login_screen:59-75` | `auth/registro*` ✓ | Web usa API local de repoweb, no `app/` | A7: repuntar a `/api/mercado/v1` de `app/` | Registro deja cuenta operativa idéntica |
| C2 | Google OAuth | — | ✓ deeplink `mercadoaltoque://auth` | `auth/google` + callback ✓ | Web no lo ofrece | Opcional: OAuth en canal web | Login Google operativo |
| C3 | Identidad doc+selfie | ✓ upload archivos (`subirIdentidad`, base64) | ✓ cámara `image_picker` (`profile_screen:72-83`) | `POST identidad` ✓ | Paridad (fuente de archivos distinta: plataforma) | — | Identidad pasa a `documentacion_cargada` en ambos |
| C4 | Gate de compra por identidad | ✓ (`PuertaLegal`/identidad) | ✓ `puedeComprar` (`models.dart:44-45`) | Backend rechaza igual | Paridad | — | Comprador sin identidad no compra, en ambos |
| C5 | Puestos + catálogo | ✓ | ✓ `stands_screen` (caché 45s) | `puestos`, `puestos/:/productos` ✓ | Paridad | — | Catálogo coherente entre clientes |
| C6 | Carrito/checkout idempotente | ✓ (`idempotency-key`, `mercado.tsx:48`) | ✓ clave persistida + body para reintento (`market_api.dart:410-443`) | ✓ | Paridad | — | Reintento no duplica pedido, en ambos |
| C7 | Pedidos comprador + detalle | ✓ | ✓ polling 10s (`order_detail_screen:24-38`) | ✓ | Paridad | — | Hitos y estados mapeados idénticos |
| C8 | **Cancelar pedido comprador** | ✓ (acción visible solo en pedido confirmado; backend valida que no esté preparando/asignado) | ✗ | `POST pedidos/:/cancelar` ✓ (M9g: restituye reserva + audita) | Falta UI en Flutter | D1: UI cancelar en Flutter | Cancelado devuelve stock y audita, igual en ambos |
| C9 | Preparación (en_preparacion→listo) | vía ERP (`updatePedidoEstado`) | ✓ acción en Caja (M10) | `/api/v1/pedidos/:id/estado` ✓ | Ambos clientes usan la misma validación y persistencia canónicas; aceptación integrada pendiente | B3 implementado | Pedido Mercado pasa a "listo" desde ambas UIs |
| C10 | Recorridos: armar (comprador) | ✓ (`armarRecorrido`, `mercado.tsx:288`) | ✓ `buyer_orders:179-215` | `POST recorridos` ✓ | Paridad | — | Mismo pedido no entra en 2 recorridos (409 backend) |
| C11 | Recorridos: aceptar/rechazar/retirar/entregar | ✓ (`accion`, `mercado.tsx:323`) | ✓ `courier_screen:122-177` | ✓ | Paridad | — | Transición inválida rechazada igual |
| C12 | Calificación | ✓ (`calificar`, `mercado.tsx:299`) | ✓ 1-5 + comentario | `POST calificar` ✓ | Paridad | — | Puntos/reputación actualizados igual |
| C13 | Ranking | ✓ (estado `ranking`, `mercado.tsx:39,137`) | ✗ | `GET ranking` ✓ | Falta en Flutter | D2: pantalla ranking | Mismos niveles/puntos que web |
| C14 | Avisos | ✓ (estado `avisos`) | ✗ | `GET avisos` ✓ (M9g) | Falta en Flutter | D3: avisos | Avisos visibles en ambos |
| C15 | Legal Torre (B.1–B.3) | ✓ `PuertaLegal` | ✓ Perfil (`profile_screen:277-291`, 409→reconsulta) | `legal/documentos*` ✓ | Paridad; versiones históricas sin UI (B.4 opcional backend) | D5 (opcional, tras decisión §5) | Aceptación version+hash idéntica |
| C16 | Recuperar/restablecer contraseña | — | ✗ | `auth/recuperar` + `restablecer` ✓ (`mercado.ts:297,314`) | Falta UI Flutter | D4: flujo recuperación en login | Reset cambia contraseña y permite reingresar |
| C17 | Condición comercial congelada | — | — | `pedidos.condicion` (M9g, migración 0015) | Verificar lectura en clientes | Mostrar condición en detalle pedido | Misma condición visible web y app |
| C18 | Publicidad comercial | gestión en Torre (`control-fn:708,748`) | ✗ | `app/`: ✗ | Bloque Fase 7 del plan de 10 fases | G: backend publicidad + UIs | Aviso publicado visible en canal |

## 4. Plan de implementación priorizado por dependencias

Orden estricto; cada ítem cierra con verificación triple (`tsc --noEmit` + `npm test` + `test:e2e` en backend; `analyze` + unit + e2e en Flutter) + commit identificable + push.

### Bloque A — repoweb → frontend puro sobre `app/` (8–13 sesiones)

| Paso | Contenido | Por qué va aquí |
|---|---|---|
| **A0** | Implementado en `central-http.ts`: suscripción, addons, capacidades, lectura y aceptación de contratos legales exigen admin; vendedor/cajero recibe 403 `rol_no_permitido`. Falta prueba automatizada de acceso cruzado | Seguridad primero (§1/§6 del mandato). Desbloquea A8 y H |
| A1 | Parcial en código: auth web proxied a Better Auth de `app/`, OAuth Google/X configurable en el backend canónico y nombre de cookie compartido; faltan credenciales/orígenes de despliegue y aceptación del ciclo completo. Torre conserva su `torreGuard` y validación local transitorios | Prueba autenticada Web/Flutter más Torre, roles y sesiones existentes antes de retirar el Better Auth local |
| A2 | Núcleo ERP: productos/stock/alertas → clientes (edición+pagos) → pedidos (incl. anular) → caja/cobros (incl. anular) → tickets | Módulos de mayor tráfico; dependen solo de A1 |
| A3 | Implementado en repoweb: remitos, OCR y proveedores usan `/api/v1`; OCR directo desde repoweb retirado. Falta ejecutar aceptación integrada Web↔API en DEV | Depende de A2 (productos) |
| A4 | Implementados en repoweb sobre `/api/v1`: usuarios, auditoría, dashboard, reportes, ranking y marca/canal; branding público usa `/api/tenant`. Falta aceptación integrada Web↔API en DEV | Solo lecturas/admin, bajo riesgo |
| A5 | Implementado en repoweb: las ocho operaciones ARCA usan `/api/v1/afip/*`; reglas y certificados siguen en `app/`. Falta aceptación integrada Web↔API en DEV | Certificados ya viven en servidor; solo cambia el punto de entrada |
| A6 | Implementados en repoweb los proxies del portal cliente, registro/recuperación, comprobantes de caja y chat REST; eliminado acceso local a BD y WS propio para chat | Falta aceptación integrada Web↔API en DEV; portal queda web (§0.2) |
| A7 | Implementado en código: Mercado web y su puerta legal pasan por `/api/mercado/v1` de `app/`; retirado el backend HTTP/SQL local de Mercado; añadida cancelación de pedidos (C8). Smoke de `GET /ranking` por el proxy: HTTP 200. Falta aceptación autenticada Web↔API en DEV | Mercado tiene autenticación propia del canal en `app/`; no depende del Better Auth de staff (A1) |
| A8 | Implementado en código: suscripción, capacidades, contrato e historial web → `/api/v1/suscripcion*`; aceptación reenvía versión/hash y metadatos al backend. `central-http.ts` queda **solo para Torre** (H) | Requiere A0; falta aceptación integrada autenticada en DEV |

### Bloque B — puesto_flutter hasta paridad (5–7 sesiones; paralelizable con A desde B1)

| Paso | Contenido | Ref. matriz |
|---|---|---|
| B1 | Implementado en código: anular pedido pendiente y venta desde Caja con motivo, confirmación, errores del backend visibles y refresco de datos. Anulación de venta facturada requiere completar nota de crédito desde Flutter (B7); falta smoke integrado | Operaciones financieras críticas, backend listo |
| B2 | Implementado en código: ficha editable completa y registro de pagos CC desde la cuenta, con nota opcional, monto validado, errores del backend visibles e invalidación de saldos/movimientos. Falta smoke integrado Web↔API↔Flutter | Backend listo; M19/M20 |
| B3 | Implementado en código: pedidos en preparación pueden marcarse listos desde Caja; la respuesta no se simula, se releen detalle y lista, y se muestran errores canónicos. Falta smoke integrado Web↔API↔Flutter | M10/C9; API canónica |
| B4 | Panel proveedores (M24) | CRUD simple |
| B5 | Alta de remitos + OCR con foto (M21/M22; `image_picker` Android, `file_selector` Windows) | La dependencia más pesada de UI |
| B6 | Reportes productos/historial (M28) + ranking cargadores (M29) | Solo lectura |
| B7 | ARCA UI (M30): config, habilitar, emitir factura, NC, listado, ver | Extra aprobado |
| B8 | Chat de pedido con polling (M32) | WS opcional después (C-bloque) |
| B9 | Recuperación de contraseña (M2) | Depende de decidir entrega del link (§5) |
| B10 | Reordenar catálogo (M6) + config marca/canal (M31) | Config admin |
| B11 | Outbox offline persistente Android (M9) | Último: toca persistencia local |

### Bloques C–H

| Bloque | Contenido | Sesiones |
|---|---|---|
| C | Chat en vivo: unificar WS (web) + polling (Flutter) con resultados equivalentes | 1–2 |
| D | mercado_flutter: cancelar (D1), ranking (D2), avisos (D3), recuperar (D4), condición comercial visible (C17) | 1–2 |
| E | Pruebas comparativas por módulo: misma operación desde web y Flutter contra mismos datos → mismos resultados (intercalado con A–D) | 2–3 |
| F | Regresión total: e2e 25+ de `app/`, 177 unit, suites Flutter Win/Android, smoke web | 1–2 |
| G | Publicidad/Push (Fase 7 del plan de 10 fases): backend + UIs | 2–4 |
| H | Torre escritorio Windows (mandato maestro: informe A/B/C/D → Electron + adaptador; depende de A0) | 3–5 |

**Total estimado: 24–40 sesiones** (sin cambios respecto de la estimación aprobada).

## 5. Decisiones de producto / backend nuevo a consultar (no bloquean el inicio)

1. **SMTP para recuperación de contraseña** (M2, C16): hoy los links van a consola (`app/server.ts:116-126`). Sin SMTP, la recuperación en producción no entrega el link. ¿Se provee SMTP o queda DEV-only?
2. **Alta pública de puesto/tenant** (M3): ¿endpoint público en `app/` (backend nuevo) o el primer dueño se da de alta a mano como hasta ahora?
3. **B.4 historial legal de Mercado** (C15): backend opcional no implementado. ¿Se construye?
4. **Impresión térmica directa en Flutter** (M17): requiere conocer el hardware (Bluetooth/USB). Queda el diálogo del sistema como paridad aceptada.
5. **OpenAPI desactualizada**: `openapi-v1.yaml` cubre 35 de 76+ paths (sin mercado/afip/portal/legal). Se actualiza en F.

## 6. Criterio de aceptación final (§8 del mandato — verificación al cierre)

- [ ] Toda funcionalidad de la matriz existe y funciona en ambas interfaces (o tiene excepción de plataforma documentada).
- [ ] Permisos equivalentes por rol/capacidad en web y Flutter (mismo 403).
- [ ] Estados y resultados coinciden para las mismas operaciones y datos.
- [ ] Cero reglas de negocio duplicadas en clientes (repoweb sin SQL de negocio; Flutter sin cálculos financieros).
- [ ] Pruebas comparables pasando en ambas plataformas.
- [ ] Faltantes documentados en §5, ninguno oculto.
