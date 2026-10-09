# Inventario de funciones server-side

Fase 0 del plan de migración: toda función expuesta al cliente web
(`createServerFn`) con su caso de uso, rol requerido, tablas que toca y su
estado en la API móvil `/api/v1`.

Convenciones de la columna **Rol**:

- `admin`, `cajero`, `vendedor`: roles de staff del puesto.
- `cualquier staff`: staff activo del tenant sin restricción adicional de rol.
- `cliente`: cuenta del portal de clientes.
- `público`: sin sesión.
- `— (servidor)`: helpers internos ARCA / OCR, nunca invocados desde el bundle.

`API v1` indica la ruta equivalente en `/api/v1` (`—` = sólo web por ahora).
Las cuatro tablas de Better Auth (`user`, `account`, `session`, `verification`)
se abrevian como `user/account`.

## `src/lib/fn.ts` — 35 funciones (mostrador web)

Todas delegan en `src/lib/server/*` (misma lógica que consume `/api/v1`) y
exigen `authMiddleware` salvo `prepareDemo`.

| Función | Servicio | Caso de uso | Rol | Tablas | API v1 |
| --- | --- | --- | --- | --- | --- |
| `prepareDemo` | bootstrap | Prepara cuentas demo (sólo DEV con `SEED_DEMO`) | público | user/account, staff, tenants | — |
| `getSessionStaff` | bootstrap + context | Identidad del staff y tenant para la sesión | cualquier staff | staff, tenants | GET /session |
| `quienSoy` | bootstrap | Distinguir staff de cliente al entrar | autenticado | staff, clientes | — |
| `listProductos` | catalog-pedidos | Catálogo completo del tablero | cualquier staff | productos | GET /catalogo |
| `saveProducto` | productos | Alta/edición de producto (precio, alias, stock inicial, `publicadoOnline` con validación de tier Torre) | admin | productos, stock_movimientos, alertas, auditoria | POST /productos |
| `quitarProducto` | productos | Baja lógica de producto | admin | productos, auditoria | POST /productos/:id/baja |
| `ordenarProductos` | productos | Reordenar el tablero de productos | admin | productos | POST /productos/orden |
| `listClientes` | clientes | Listado de clientes del puesto | cualquier staff | clientes | GET /clientes |
| `createCliente` | clientes | Alta rápida de cliente | cualquier staff | clientes | POST /clientes |
| `crearPedido` | catalog-pedidos | Crear pedido idempotente por `clientUuid` | cualquier staff | pedidos, pedido_items, auditoria | POST /pedidos |
| `listPedidos` | pedidos | Listar pedidos (propias / por estado) | cualquier staff | pedidos, pedido_items, staff | GET /pedidos |
| `getPedido` | pedidos | Detalle de pedido con ítems | cualquier staff | pedidos, pedido_items | GET /pedidos/:id |
| `updatePedidoEstado` | pedidos | Avanzar estado en la cola de armado | admin, cajero | pedidos, auditoria | POST /pedidos/:id/estado |
| `marcarEntregado` | pedidos | Marcar entregado (pedido ya cobrado) | admin, cajero, vendedor | pedidos, auditoria | POST /pedidos/:id/entregar |
| `updatePedidoItems` | pedidos | Editar ítems de un pedido no cobrado | admin, cajero | pedidos, pedido_items, stock_movimientos, auditoria | POST /pedidos/:id/items |
| `cobrarPedido` | cobros | Cobrar + ticket correlativo + descuento de stock | admin, cajero | pedidos, cobros, tickets, ticket_seq, stock_movimientos, cuenta_movimientos, alertas, auditoria | POST /pedidos/:id/cobrar |
| `anularPedido` | cobros | Anular pedido (restituye stock o libera reserva) | admin, cajero | pedidos, cobros, stock_movimientos, auditoria | POST /pedidos/:id/anular |
| `anularCobro` | cobros | Anular cobro/ticket (restituye stock y CC) | admin, cajero | cobros, pedidos, stock_movimientos, cuenta_movimientos, auditoria | POST /cobros/:id/anular |
| `getTicket` | cobros | Recuperar ticket emitido (contenido JSON) | cualquier staff | tickets | GET /cobros/:id/ticket |
| `dashboardResumen` | panel | Métricas del panel (series, top, cola, formas de pago) | admin | cobros, pedidos, pedido_items, tickets | GET /dashboard |
| `listAlertas` | panel | Alertas del puesto (stock, caja, portal) | cualquier staff | alertas | GET /alertas |
| `marcarAlertaLeida` | panel | Marcar alerta como leída | cualquier staff | alertas | POST /alertas/:id/leida |
| `listUsuarios` | usuarios | Listar staff del tenant | admin | staff | GET /usuarios |
| `createUsuario` | usuarios | Alta de usuario con credenciales | admin | user/account, staff, auditoria | POST /usuarios |
| `toggleUsuario` | usuarios | Activar/desactivar usuario | admin | staff, auditoria | POST /usuarios/:id/toggle |
| `listAuditoria` | panel | Log de auditoría (80 últimos) | admin | auditoria | GET /auditoria |
| `estadoCaja` | caja | Caja abierta + cobros de efectivo del turno | admin, cajero | cierres_caja, cobros, pedidos, tickets, facturas | GET /caja |
| `cerrarCaja` | caja | Cierre con arqueo, alerta por diferencia y reapertura | admin, cajero | cierres_caja, cobros, alertas, auditoria | POST /caja/cerrar |
| `ajustarStock` | stock | Ajuste positivo o merma con motivo | admin, cajero | stock_movimientos, productos, alertas, auditoria | POST /stock/ajuste |
| `crearRemito` | remitos | Cargar remito (CSV/foto/manual/PDF) con match difuso | admin, cajero | remitos, remito_items, proveedores | POST /remitos |
| `getRemito` | remitos | Detalle de remito con líneas y confianza de match | cualquier staff | remitos, remito_items | GET /remitos/:id |
| `listRemitos` | remitos | Últimos 30 remitos del puesto | admin, cajero | remitos | GET /remitos |
| `actualizarRemitoItem` | remitos | Corregir match/cantidad/confirmación de una línea | admin, cajero | remito_items | POST /remitos/items |
| `confirmarRemito` | remitos | Ingresar stock de las líneas confirmadas (idempotente) | admin, cajero | remitos, remito_items, stock_movimientos, productos, alertas, auditoria | POST /remitos/:id/confirmar |
| `parseRemitoVision` | — (xAI `grok-4.5`) | OCR de remito por foto (requiere `XAI_API_KEY`) | admin, cajero | — (no toca DB) | POST /remitos/ocr |

Cobertura: `listRemitos` se expone como `GET /remitos` y `parseRemitoVision`
como `POST /remitos/ocr`. Quedan sólo en la web `prepareDemo` (demo DEV) y
`quienSoy` (detección de portal). La ruta extra `GET /clientes/:id/cuenta` usa
`cuentaClienteForStaff` directamente (no tiene equivalente web en `fn.ts`).

## `src/lib/portal-fn.ts` — 18 funciones (portal de clientes y admin)

SQL inline; sin servicio compartido. No expuestas en `/api/v1` todavía.

| Función | Caso de uso | Rol | Tablas |
| --- | --- | --- | --- |
| `registrarCliente` | Alta self-service del cliente (credenciales + ficha) | público | user/account, clientes |
| `recordarUsuario` | Recordar email (enmascarado) | público | user/account, clientes |
| `recuperarClave` | Reset de clave validando email + CUIT | público | user/account, clientes |
| `catalogoCliente` | Catálogo para el portal (sólo activos) | cliente | productos |
| `miFicha` | Ficha propia del cliente | cliente | clientes |
| `guardarMiFicha` | Editar ficha propia (teléfono, dirección, CUIT) | cliente | clientes |
| `misMovimientos` | Cuenta corriente propia (40 movimientos) | cliente | cuenta_movimientos |
| `misPedidos` | Pedidos propios (40) | cliente | pedidos, pedido_items |
| `pedirComoCliente` | Pedido del portal: reserva stock y alerta al negocio | cliente | pedidos, pedido_items, stock_movimientos, alertas |
| `verComprobante` | Ver comprobante de transferencia adjunto | cliente dueño, staff | pedidos |
| `listarClientes` | Listado de clientes para administración | admin | clientes |
| `guardarCliente` | Alta/edición de cliente con condición IVA | admin | clientes, auditoria |
| `anotarPagoCuenta` | Registrar pago a cuenta corriente (monto negativo) | admin | cuenta_movimientos, auditoria |
| `movimientosCliente` | Cuenta corriente de un cliente (30) | admin | cuenta_movimientos |
| `listarProveedores` | Listado de proveedores | admin, cajero | proveedores |
| `guardarProveedor` | Alta/edición de proveedor | admin | proveedores, auditoria |
| `productosDelProveedor` | Últimos productos asociados a un proveedor | admin | remito_items, remitos, productos |
| `asignarProveedorRemito` | Asignar proveedor a un remito cargado | admin, cajero | remitos |

## `src/lib/afip-fn.ts` — 8 funciones (ARCA, sólo servidor)

Se mantienen exclusivamente server-side (certificado/clave nunca viajan al
cliente). Pendientes de Release 2 en `/api/v1`.

| Función | Caso de uso | Rol | Tablas |
| --- | --- | --- | --- |
| `getAfipConfig` | Config ARCA con certificado/clave enmascarados como flags | admin, cajero | afip_config |
| `guardarAfipConfig` | Cargar certificado, clave, CUIT, punto de venta y alícuota | admin | afip_config, auditoria |
| `probarAfip` | Probar conexión WSAA en homologación | admin | — |
| `setArcaHabilitada` | Habilitar/inhabilitar facturación electrónica | admin | afip_config, auditoria |
| `listarFacturacion` | Cobros pendientes de facturar y últimas emitidas | admin, cajero | cobros, facturas, tickets |
| `emitirFactura` | Emitir factura con CAE (idempotente por cobro) | admin, cajero | facturas, cobros, pedidos, pedido_items, auditoria |
| `emitirNotaCredito` | Nota de crédito asociada (idempotente) | admin, cajero | facturas, auditoria |
| `getFactura` | Ver comprobante emitido | admin, cajero | facturas |

## `src/lib/mensajes-fn.ts` — 4 funciones (chat del portal)

Pendientes de Release 2 en `/api/v1` (la web usa SSE `mensajes-vivo`).

| Función | Caso de uso | Rol | Tablas |
| --- | --- | --- | --- |
| `mensajesDelPedido` | Conversación de un pedido (marca leídos, paginada) | cliente dueño, admin | pedido_mensajes, pedidos |
| `enviarMensajePedido` | Enviar mensaje (máx. 500 caracteres) | cliente dueño, admin | pedido_mensajes |
| `conversacionesNegocio` | Bandeja del negocio con no leídos | admin | pedido_mensajes, pedidos |
| `misMensajesPendientes` | No leídos por conversación para el cliente | cliente | pedido_mensajes |
