# API móvil v1

`app/` es la autoridad de Better Auth en `/api/auth/*` para Web y Flutter.
Flutter inicia sesión por ese
contrato existente (`POST /api/auth/sign-in/email` con `Origin`) y envía el
token de sesión como `Authorization: Bearer <token>` en las llamadas a
`/api/v1`. La Web conserva Google/X, pero inicia y completa esos proveedores a
través del proxy hacia esta API y usa la misma sesión. El tenant sale siempre
de la sesión; nunca se acepta por parámetro.

Para desplegar el proxy web, configura `BETTER_AUTH_URL` con el origen público
compartido y registra en el broker los callbacks
`/api/auth/oauth2/callback/grok-google` y `/api/auth/oauth2/callback/grok-x`.
Web y `app/` deben compartir `DATABASE_URL` y `BETTER_AUTH_SECRET` mientras
repoweb conserve las funciones locales de Torre que verifican la sesión.

Contrato versionado: [`openapi-v1.yaml`](./openapi-v1.yaml). Inventario de
funciones y roles: [`inventario-funciones.md`](./inventario-funciones.md).
El branding público completo del puesto (incluido el fondo de login) está
disponible sin autenticación en `GET /api/tenant`; su respuesta es compatible
con Flutter y con la web.

## Respuestas y errores

- Envoltura estándar `{ data: ... }`; `GET /session` responde
  `{ staff: { id, nombre, rol, puedeCambiar }, tenantId, casaId, sucursal }` y
  `GET /catalogo` `{ data, version }`. `sucursal` es `{ id, nombre }` o `null`.
- Creaciones (`POST /pedidos`, `/clientes`, `/productos`, `/remitos`,
  `/usuarios`, `/sucursales`) responden `201`.
- Montos: números decimales (≤ 2 decimales). Fechas: ISO-8601 UTC.
- Todas las respuestas incluyen `Vary: authorization`.

| Código | `error` | Cuándo |
| --- | --- | --- |
| `400` | `invalid_request` | Cuerpo/parámetro inválido o regla de negocio (`message` en español). |
| `401` | `unauthorized` | Token ausente, inválido o vencido (sin `message`). |
| `403` | `forbidden` | Usuario sin staff activo o rol insuficiente (`message`). |
| `404` | `not_found` | Ruta inexistente (sin `message`) o recurso no encontrado (con `message`). |
| `415` | `unsupported_media_type` | Operación con cuerpo sin `Content-Type: application/json`. |

El cuerpo se parsea antes de verificar el rol: una petición con cuerpo
inválido devuelve `400` aunque el rol no alcance. Para probar `403` hay que
enviar un cuerpo válido.

## Rutas

| Método | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/v1/session` | cualquier staff | Identidad, rol y tenant verificados por servidor. |
| `GET` | `/api/v1/catalogo` | cualquier staff | Catálogo completo; `?since=<ISO-8601>` incremental. |
| `POST` | `/api/v1/pedidos` | cualquier staff | Crea/reintenta un pedido idempotente. |
| `GET` | `/api/v1/pedidos` | cualquier staff | Lista; `?mine=1` propios, `?estados=a,b` por cola. |
| `GET` | `/api/v1/pedidos/:id` | cualquier staff | Detalle con ítems. |
| `POST` | `/api/v1/pedidos/:id/estado` | admin, cajero | Cambia el estado de la cola de armado. |
| `POST` | `/api/v1/pedidos/:id/entregar` | admin, cajero, vendedor | Marca entregado (pedido ya cobrado). |
| `POST` | `/api/v1/pedidos/:id/items` | admin, cajero | Reemplaza ítems y ajusta reservas. |
| `POST` | `/api/v1/pedidos/:id/cobrar` | admin, cajero | Cobra e idempotente; ticket + stock. |
| `POST` | `/api/v1/pedidos/:id/anular` | admin, cajero | Anula pedido con motivo; repone stock o libera reserva. |
| `GET` | `/api/v1/cobros/:id/ticket` | cualquier staff | Contenido del ticket emitido. |
| `POST` | `/api/v1/cobros/:id/anular` | admin, cajero | Anula venta con motivo; repone stock y reversa cuenta. |
| `GET` | `/api/v1/clientes` | cualquier staff | Lista de clientes. |
| `POST` | `/api/v1/clientes` | cualquier staff | Alta rápida `{ nombre, telefono?, cuentaCorriente? }`. |
| `GET` | `/api/v1/clientes/:id/cuenta` | admin | Saldo y últimos movimientos de cuenta corriente. |
| `POST` | `/api/v1/productos` | admin | Alta/edición de producto (con stock inicial opcional; `publicadoOnline` exige tier Presencia/Pro en Torre). |
| `POST` | `/api/v1/productos/:id/baja` | admin | Baja lógica. |
| `POST` | `/api/v1/productos/orden` | admin | Reordena con una lista de ids. |
| `POST` | `/api/v1/stock/ajuste` | admin, cajero | Ajuste o merma `{ productoId, cantidad, tipo, motivo }`. |
| `POST` | `/api/v1/remitos` | admin, cajero | Crea remito (csv, foto, pdf o manual). |
| `GET` | `/api/v1/remitos` | admin, cajero | Últimos 30 remitos, sin líneas. |
| `GET` | `/api/v1/remitos/:id` | cualquier staff | Detalle del remito con líneas. |
| `POST` | `/api/v1/remitos/items` | admin, cajero | Actualiza una línea (cantidad/confirmado). |
| `POST` | `/api/v1/remitos/:id/confirmar` | admin, cajero | Confirma y suma stock. |
| `POST` | `/api/v1/remitos/ocr` | admin, cajero | OCR de foto por xAI; 503 `ocr_unavailable` sin `XAI_API_KEY`. |
| `POST` | `/api/v1/remitos/:id/proveedor` | admin, cajero | Asigna un proveedor activo al remito. |
| `GET` | `/api/v1/proveedores` | admin, cajero | Lista de proveedores (activos primero). |
| `POST` | `/api/v1/proveedores` | admin | Alta de proveedor. |
| `POST` | `/api/v1/proveedores/:id` | admin | Edición; `activo` booleano obligatorio. |
| `GET` | `/api/v1/proveedores/:id/productos` | admin | Nombres distintos de productos comprados (máx. 40). |
| `GET` | `/api/v1/usuarios` | admin | Lista de staff. |
| `POST` | `/api/v1/usuarios` | admin | Alta de staff con rol explícito. |
| `POST` | `/api/v1/usuarios/:id/toggle` | admin | Activa/desactiva staff. |
| `POST` | `/api/v1/usuarios/:id/cambio-sucursal` | admin | Habilita o revoca (`{ puedeCambiar }`) el cambio de sucursal. |
| `GET` | `/api/v1/sucursales` | cualquier staff | Lista del puesto; `cruce` (7 días) y `productos` sólo dueño. Crea la matriz al primer uso. |
| `POST` | `/api/v1/sucursales` | admin | Alta `{ nombre, referencia? }` según cupo de Torre; copia catálogo con stock 0 y sin publicado online. |
| `POST` | `/api/v1/sucursales/:id/usar` | staff habilitado | Cambia la sucursal activa (matriz o habilitada por el dueño). |
| `POST` | `/api/v1/sucursales/:id/transferir` | admin | Pasa stock de la matriz a la sucursal (`{ productoId, cantidad }`). |
| `POST` | `/api/v1/sucursales/:id/importar-clientes` | admin | Copia fichas de clientes de la casa a la sucursal (sin saldos). |
| `GET` | `/api/v1/alertas` | cualquier staff | Alertas (stock bajo, caja, etc.). |
| `POST` | `/api/v1/alertas/:id/leida` | cualquier staff | Marca alerta como leída. |
| `GET` | `/api/v1/dashboard` | admin | Resumen; `?dias=N` ajusta la ventana. |
| `GET` | `/api/v1/caja` | admin, cajero | Estado de caja abierta con totales y últimos cobros. |
| `POST` | `/api/v1/caja/cerrar` | admin, cajero | Cierre `{ id, real, notas? }`; alerta si hay diferencia. |
| `GET` | `/api/v1/auditoria` | admin | Últimos movimientos auditados. |
| `GET` | `/api/v1/afip/config` | admin, cajero | Configuración pública ARCA, sin exponer certificado ni clave. |
| `POST` | `/api/v1/afip/config` | admin | Guarda datos fiscales y certificados del puesto. |
| `POST` | `/api/v1/afip/probar` | admin | Prueba conexión con ARCA y WSAA. |
| `POST` | `/api/v1/afip/habilitada` | admin | Habilita o inhabilita emisión de comprobantes. |
| `GET` | `/api/v1/afip/facturacion` | admin, cajero | Cola pendiente y comprobantes autorizados. |
| `POST` | `/api/v1/afip/facturas` | admin, cajero | Emite o recupera la factura de un cobro. |
| `POST` | `/api/v1/afip/notas-credito` | admin, cajero | Emite nota de crédito para una factura. |
| `GET` | `/api/v1/afip/facturas/:id` | admin, cajero | Detalle imprimible del comprobante, incluido QR. |
| `GET` | `/api/v1/pedidos/:id/comprobante` | admin, cajero | Comprobante de transferencia asociado al pedido. |
| `GET` | `/api/v1/pedidos/:id/mensajes` | admin | Mensajes del pedido; `?antes=<ISO-8601>` pagina hacia atrás y marca los del cliente como leídos. |
| `POST` | `/api/v1/pedidos/:id/mensajes` | admin | Envía un mensaje del puesto al cliente (`{ cuerpo }`). |
| `GET` | `/api/v1/mensajes/conversaciones` | admin | Conversaciones del puesto ordenadas por último mensaje. |
| `POST` | `/api/v1/portal/registro` | público | Registra un cliente y crea su credencial. |
| `POST` | `/api/v1/portal/recordar` | público | Busca usuario por CUIT o teléfono y devuelve correo enmascarado. |
| `POST` | `/api/v1/portal/recuperar` | público | Recupera clave de cliente por correo + CUIT. |
| `GET` | `/api/v1/portal/catalogo` | cliente | Catálogo activo del tenant de la ficha. |
| `GET` | `/api/v1/portal/ficha` | cliente | Ficha del cliente autenticado y condición de cuenta corriente del plan. |
| `POST` | `/api/v1/portal/ficha` | cliente | Actualiza los datos personales de la ficha. |
| `GET` | `/api/v1/portal/movimientos` | cliente | Movimientos de cuenta corriente de la ficha. |
| `GET` | `/api/v1/portal/pedidos` | cliente | Pedidos propios del cliente. |
| `POST` | `/api/v1/portal/pedidos` | cliente | Crea pedido con reserva de stock y validación de plan. |
| `GET` | `/api/v1/portal/pedidos/:id/comprobante` | cliente | Comprobante de transferencia propio del cliente. |
| `GET` | `/api/v1/portal/pedidos/:id/mensajes` | cliente | Mensajes propios del pedido; admite `?antes=<ISO-8601>`. |
| `POST` | `/api/v1/portal/pedidos/:id/mensajes` | cliente | Envía un mensaje al puesto (`{ cuerpo }`). |
| `GET` | `/api/v1/portal/mensajes-pendientes` | cliente | Recuento de mensajes del puesto sin leer. |

## Catálogo incremental

`GET /catalogo` devuelve `{ data, version }` y un `ETag`. Si el cliente manda
el mismo valor en `If-None-Match`, la respuesta es `304` sin payload. En la
sincronización incremental, `version` debe persistirse sólo después de aplicar
correctamente las filas recibidas. Los registros de límite pueden repetirse y
deben resolverse con upsert por `id`; nunca se pierden cambios.

## Sucursales

El puesto principal es la casa; cada sucursal tiene sus propios libros
operativos. La sesión expone `casaId` (siempre la casa) y, dentro de una
sucursal, `tenantId` apunta a esos libros: catálogo, stock, caja, pedidos y
tickets quedan aislados por sucursal sin cambiar las rutas. Los clientes y el
staff viven en la casa; `GET /clientes` dentro de una sucursal lista las fichas
de la sucursal y `POST /sucursales/:id/importar-clientes` copia fichas sin
saldos. El alta de sucursales respeta el cupo de Torre (base incluye la
matriz; cada línea `sucursal-extra` o de tipo `branch` suma una) y sólo el
dueño puede crearlas, transferir stock e importar fichas. `POST
/sucursales/:id/usar` sólo está disponible para quien tenga `puedeCambiar`
(el dueño siempre; cajero y vendedor si el dueño los habilita).

## Idempotencia

`POST /pedidos` y `POST /pedidos/:id/cobrar` reciben `clientUuid`. La outbox
debe generarlo y persistirlo antes del primer envío: un reintento con el mismo
valor devuelve el recurso original sin duplicar pedido, cobro, ticket ni
movimientos de stock. Está respaldado por la restricción PostgreSQL
`(tenant_id, client_uuid)` en `pedidos` y `cobros`.

## Pruebas

Suite de caracterización contra la API real (login Bearer, permisos, tenant e
idempotencia): `npm run test:e2e` (requiere `DATABASE_URL` en `app/.env`).
