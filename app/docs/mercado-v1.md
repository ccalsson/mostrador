# Mercado al Toque API

Mercado al Toque is a separate client of Mostrador's HTTP API. It does not
connect directly to PostgreSQL and it does not maintain a separate product or
stock ledger.

## Base URL and authentication

The API base path is `/api/mercado/v1`. Except for account entry points,
Google OAuth, sign-out, and the public ranking, requests require:

```http
Authorization: Bearer <mercado-session-token>
Accept: application/json
```

Sessions expire after 30 days. A successful response is JSON. Errors have the
shape `{ "error": "code", "message": "..." }`. The Flutter application stores
the token using secure platform storage and can override its default API URL
with the build-time `API_BASE_URL` define.

## Accounts and identity

### Register a buyer

`POST /auth/registro` returns `201` with `token` and `usuario`.

```json
{
  "nombre": "Nombre",
  "email": "buyer@example.com",
  "password": "at-least-8-characters",
  "telefono": "+54 11 5555 0101",
  "pais": "AR",
  "tipoDocumento": "DNI",
  "numeroDocumento": "12345678"
}
```

`pais` is `AR` with `tipoDocumento: "DNI"`, or `PY` with
`tipoDocumento: "CI_PY"`.

### Register a Changarín

`POST /auth/registro-cargador` accepts `nombre`, `email`, `password`, and
`telefono`. It returns `201` with `token` and `usuario`.

### Sign in and session

- `POST /auth/ingreso`: `{ "email", "password", "perfil" }`, where `perfil`
  is `comprador` or `cargador`.
- `GET /yo`: current account.
- `POST /auth/salir`: revoke the bearer session.

### Google sign-in

`POST /auth/google` accepts `{ "perfil": "comprador" | "cargador",
"destino": "app" | "web" }`; `destino` defaults to `app`. The response
contains an authorization `url`. The callback is
`GET /auth/google/callback`; it validates the one-time state and redirects to
the app deep link or web Mercado page.

Configure `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` with credentials
for a Google OAuth web client whose authorized redirect URI is
`<BETTER_AUTH_URL>/api/mercado/v1/auth/google/callback`. Google sign-in is
unavailable until those credentials and redirect URI are configured.

### Upload buyer identity documents

`POST /identidad` accepts `pais`, `tipoDocumento`, `numeroDocumento`,
`documentoBase64`, and `selfieBase64`. Each decoded image must be between 8
bytes and 8 MB. The response returns `estado: "documentacion_cargada"` and
opaque file references. This records submitted documentation; it does not
claim that the identity has been manually verified.

## Catalog and checkout

All endpoints below require a session.

- `GET /puestos` returns enabled stands.
- `GET /puestos/{tenantId}/productos` returns active, online-published products
  and current available stock.
- `GET /cargadores` returns the public courier list and ranking details.
- `GET /ranking` is public.

To publish a stand, set `tenants.config.mercadoAlToque` to boolean `true`.
Products are listed only when `activo = true` and `publicado_online = true`.
These flags default to disabled. Prices, product identity, and stock are read
from the existing Mostrador catalog.

`POST /pedidos` requires a buyer with submitted identity documentation and an
`Idempotency-Key` header (8–200 characters; letters, digits, `_`, `:`, `.`, and
`-` only). The request is:

```json
{
  "medioPago": "efectivo",
  "nota": "Optional note",
  "items": [
    { "tenantId": "stand-id", "productoId": "product-id", "cantidad": 2 }
  ]
}
```

`medioPago` is `efectivo` or `transferencia`. Items from different stands are
split into one Mostrador pedido per stand within a single transaction. Prices
and availability are re-read and stock is reserved through Mostrador's stock
service; a failure rolls back the complete checkout. Reusing the same
idempotency key and request replays the original response; using that key for
a different request returns `409`.

- `GET /pedidos`: the buyer's orders.
- `GET /pedidos/{pedidoId}`: one of the buyer's orders.

Orders are created with payment state `pendiente`; this API does not charge a
payment method. Mercado orders are prepared through Mostrador before they can
be assigned for pickup.

## Courier routes

- `POST /cargador/disponibilidad`: set
  `{ "disponibilidad": "disponible" | "no_disponible" }`.
- `GET /recorridos`: the current user's routes.
- `POST /recorridos` (buyer): `{ "cargadorId", "pedidoIds" }` and an
  `Idempotency-Key`; all listed orders must belong to the buyer and be ready.
- `POST /recorridos/{id}/aceptar` or `/rechazar` (Changarín): requires an
  `Idempotency-Key`.
- `POST /recorridos/{id}/retirar` or `/entregar` (Changarín): body
  `{ "pedidoId" }` and an `Idempotency-Key` for the action.
- `POST /recorridos/{id}/calificar` (buyer): `{ "estrellas": 1..5,
  "comentario": "..." }`.

Only the assigned Changarín can accept, reject, pick up, or deliver a route.
Each stop must be picked up before it is delivered. A rejected route releases
its orders for reassignment.

Repeating a completed rating returns `409 already_rated`; a database-level
uniqueness conflict returns `409 conflict`.

## Flutter app

The independent Android application is in `clients/mercado_flutter`. From
that directory:

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk
```

For a non-default server, pass for example
`--dart-define=API_BASE_URL=https://example.test/api/mercado/v1` to the Flutter
build command. The Android app uses `mercadoaltoque://auth` for the OAuth
return.
