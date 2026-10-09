# API móvil v1

La API mantiene Better Auth en `/api/auth/*`. Flutter inicia sesión por ese
contrato existente (`POST /api/auth/sign-in/email` con `Origin`) y envía el
token de sesión como `Authorization: Bearer <token>` en las llamadas a
`/api/v1`. El tenant sale siempre de la sesión; nunca se acepta por parámetro.

Contrato versionado: [`openapi-v1.yaml`](./openapi-v1.yaml). Inventario de
funciones y roles: [`inventario-funciones.md`](./inventario-funciones.md).

## Respuestas y errores

- Envoltura estándar `{ data: ... }`; `GET /session` responde
  `{ staff: { id, nombre, rol }, tenantId }` y `GET /catalogo`
  `{ data, version }`.
- Creaciones (`POST /pedidos`, `/clientes`, `/productos`, `/remitos`,
  `/usuarios`) responden `201`.
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
| `GET` | `/api/v1/alertas` | cualquier staff | Alertas (stock bajo, caja, etc.). |
| `POST` | `/api/v1/alertas/:id/leida` | cualquier staff | Marca alerta como leída. |
| `GET` | `/api/v1/dashboard` | admin | Resumen; `?dias=N` ajusta la ventana. |
| `GET` | `/api/v1/caja` | admin, cajero | Estado de caja abierta con totales y últimos cobros. |
| `POST` | `/api/v1/caja/cerrar` | admin, cajero | Cierre `{ id, real, notas? }`; alerta si hay diferencia. |
| `GET` | `/api/v1/auditoria` | admin | Últimos movimientos auditados. |

## Catálogo incremental

`GET /catalogo` devuelve `{ data, version }` y un `ETag`. Si el cliente manda
el mismo valor en `If-None-Match`, la respuesta es `304` sin payload. En la
sincronización incremental, `version` debe persistirse sólo después de aplicar
correctamente las filas recibidas. Los registros de límite pueden repetirse y
deben resolverse con upsert por `id`; nunca se pierden cambios.

## Idempotencia

`POST /pedidos` y `POST /pedidos/:id/cobrar` reciben `clientUuid`. La outbox
debe generarlo y persistirlo antes del primer envío: un reintento con el mismo
valor devuelve el recurso original sin duplicar pedido, cobro, ticket ni
movimientos de stock. Está respaldado por la restricción PostgreSQL
`(tenant_id, client_uuid)` en `pedidos` y `cobros`.

## Pruebas

Suite de caracterización contra la API real (login Bearer, permisos, tenant e
idempotencia): `npm run test:e2e` (requiere `DATABASE_URL` en `app/.env`).
