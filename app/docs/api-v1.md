# API móvil v1

La API mantiene Better Auth en `/api/auth/*`. Flutter inicia sesión por ese
contrato existente y envía el token de sesión como `Authorization: Bearer <token>`
en las llamadas a `/api/v1`.

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/session` | Identidad, rol y tenant verificados por servidor. |
| `GET` | `/api/v1/catalogo` | Carga inicial del catálogo. |
| `GET` | `/api/v1/catalogo?since=<ISO-8601>` | Cambios incrementales; aplicar como upsert local. |
| `POST` | `/api/v1/pedidos` | Crea/reintenta un pedido idempotente. |

`GET /catalogo` devuelve `{ data, version }` y un `ETag`. Si el cliente manda
el mismo valor en `If-None-Match`, la respuesta es `304` sin payload. En la
sincronización incremental, `version` debe persistirse sólo después de aplicar
correctamente las filas recibidas. Los registros de límite pueden repetirse y
deben resolverse con upsert por `id`; nunca se pierden cambios.

Para pedidos, la outbox debe generar y persistir `clientUuid` antes del primer
envío. Un reintento con el mismo valor devuelve el mismo pedido, respaldado por
la restricción PostgreSQL `(tenant_id, client_uuid)`.
