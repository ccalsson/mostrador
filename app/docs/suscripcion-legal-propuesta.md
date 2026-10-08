# Suscripción y Legal — propuesta de API v1 (para el agente de Torre)

> **ESTADO: PROPUESTA — NO IMPLEMENTADA.** Este documento define el contrato
> que las apps (`clients/puesto_flutter` y `clients/mercado_flutter`)
> consumirán para el dominio comercial/contractual. Fue escrito por el agente
> de las apps tras auditar el backend (2026-10-07): **no existe ninguna tabla
> ni endpoint de suscripciones, planes, add-ons, contratos, documentos
> legales o aceptaciones** (verificado en migraciones 0001–0010, docs
> api-v1/mercado-v1 y probes en vivo → 404). El agente de Torre decide si lo
> implementa, lo ajusta o lo rechaza. Las apps NO duplican esta lógica: solo
> consultan, muestran y envían aceptaciones.

## Principios

1. **El backend es la única fuente de verdad.** Plan, estado, precios,
   vigencias, contrato vigente, versiones y hashes los decide y calcula el
   servidor. Las apps nunca derivan ni calculan ninguno de estos valores.
2. **La aceptación es siempre online.** Solo cuenta la que el backend registra
   y confirma. Sin conexión, la app muestra información en caché pero nunca
   registra ni insinúa una aceptación definitiva.
3. **Aislamiento por tenant/perfil resuelto en servidor**, igual que el resto
   de la API: el actor (tenant + staff, o comprador/cargador) sale del token,
   nunca del body.
4. **Historial inmutable.** Las versiones y aceptaciones pasadas no se
   modifican ni se borran; solo se agregan.
5. **Add-ons por código del backend.** Las apps listan los add-ons activos tal
   como vienen en la respuesta; ningún comportamiento de app depende de un
   código hardcodeado.
6. **Convenciones heredadas:** envoltura `{ "data": ... }` en `/api/v1`,
   respuesta directa en `/api/mercado/v1`, errores
   `{ "error": "code", "message": "..." }`, autenticación Bearer,
   `Idempotency-Key` para operaciones de escritura (patrón de `pedidos`).

## Parte A — B2B SaaS (ERP Mostrador)

Base: `/api/v1`, `Authorization: Bearer <staff-token>`.
**Permiso transversal: solo `staff.rol = 'admin'`** (el dueño). `cajero` y
`vendedor` reciben `403 rol_no_permitido` en todos los endpoints de esta
parte, aunque existan endpoints o datos.

### A.1 — Resumen de suscripción

`GET /suscripcion` → `200`

```json
{ "data": {
  "suscripcion": {
    "plan": { "codigo": "plan.codigo", "nombre": "Nombre visible" },
    "estado": "activa | vencida | cancelada | prueba",
    "inicio": "2026-01-01",
    "proximaRenovacion": "2026-11-01"
  },
  "addons": [
    { "codigo": "mercado_al_toque", "nombre": "Mercado al Toque",
      "activo": true, "detalle": "..." }
  ],
  "sucursalesContratadas": 2,
  "mercadoAlToqueContratado": true,
  "precioVigente": { "moneda": "ARS", "monto": 25000, "periodo": "mensual" },
  "condicionesComerciales": { "resumen": "...", "actualizado": "2026-09-01" },
  "contratoVigente": {
    "documentoId": "contrato-marco",
    "version": 3,
    "hash": "sha256:...",
    "estado": "vigente",
    "aceptadoPorMi": true,
    "fechaAceptacion": "2026-09-02T10:00:00Z"
  },
  "pendiente": {
    "hayPendiente": false,
    "documentoId": null,
    "version": null,
    "hash": null
  }
} }
```

Errores: `401 token_invalido`, `403 rol_no_permitido`,
`404 sin_suscripcion` (tenant sin suscripción creada: la app muestra
"no disponible" y no asume error de red).

### A.2 — Documento de contrato (contenido)

`GET /suscripcion/contrato` → versión vigente.
`GET /suscripcion/contrato?version=2` → versión histórica (si el backend lo
ofrece; si no, `404 version_no_encontrada`).

```json
{ "data": {
  "documentoId": "contrato-marco",
  "version": 3,
  "hash": "sha256:...",
  "estado": "vigente | reemplazada",
  "titulo": "Contrato de prestación del servicio",
  "fechaVigencia": "2026-09-01",
  "contenido": { "formato": "texto | html | pdf_url", "valor": "..." },
  "anexos": [
    { "documentoId": "anexo-mercado", "titulo": "Anexo I — Mercado al Toque",
      "version": 1, "hash": "sha256:...",
      "contenido": { "formato": "texto", "valor": "..." } }
  ]
} }
```

Errores: `401`, `403 rol_no_permitido`, `404 contrato_no_encontrado`.

### A.3 — Historial contractual

`GET /suscripcion/contrato/historial` → `200`

```json
{ "data": { "entradas": [
  { "documentoId": "contrato-marco", "version": 3, "hash": "sha256:...",
    "tipo": "contrato | anexo", "estado": "vigente",
    "fechaDesde": "2026-09-01", "fechaHasta": null,
    "aceptacion": { "fecha": "2026-09-02T10:00:00Z",
      "aceptadoPor": "uuid-del-staff" } }
] } }
```

Solo lectura. Errores: `401`, `403 rol_no_permitido`.

### A.4 — Aceptar contrato/anexo pendiente

`POST /suscripcion/contrato/aceptar` con header `Idempotency-Key`
(UUID v4 generado por la app, reutilizado en reintentos):

```json
{ "documentoId": "contrato-marco", "version": 3, "hash": "sha256:..." }
```

El backend valida que esa versión siga vigente y que el hash coincida con el
suyo; registra **tenant_id, staff_id, documento, versión, hash aceptado,
fecha del servidor** y fila en la tabla de auditoría. Repetir la misma
`Idempotency-Key` (o aceptar dos veces la misma versión) devuelve la
aceptación existente sin duplicar.

`200`

```json
{ "data": { "aceptacionId": "uuid", "documentoId": "contrato-marco",
  "version": 3, "fecha": "2026-10-07T15:30:00Z",
  "contratoVigente": { "aceptadoPorMi": true } } }
```

Errores: `401`, `403 rol_no_permitido`, `404 version_no_encontrada`,
`409 version_obsoleta` (dejó de estar vigente: la app refresca y muestra la
nueva pendiente), `409 hash_mismatch` (la app tenía una copia vieja: la app
descarta su caché y refresca), `400 cuerpo_invalido`.

## Parte B — Documentos legales del canal (Mercado al Toque)

Base: `/api/mercado/v1`, `Authorization: Bearer <mercado-session-token>`.
**Separado del contrato B2B de la Parte A**: son documentos de cuenta
(términos, privacidad, consentimientos, reglas del rol). Cada perfil solo ve
los suyos: `comprador` los de comprador, `cargador` los de cargador
(`assertPerfil` en servidor). Los endpoints de esta parte **no** exponen nada
de la Parte A.

### B.1 — Listar documentos del perfil

`GET /legal/documentos` → `200`

```json
{ "documentos": [
  { "documentoId": "terminos-comprador", "titulo": "Términos de uso",
    "tipo": "terminos | privacidad | consentimiento | reglas",
    "versionVigente": 4, "hash": "sha256:...",
    "estado": "pendiente | aceptado",
    "fechaAceptacion": null,
    "versionAceptada": null }
] }
```

Solo devuelve los documentos del perfil del token. Cuenta con
`estado: "pendiente"` es la señal para la app de mostrar el aviso.

### B.2 — Contenido de un documento

`GET /legal/documentos/{documentoId}` → versión vigente para el perfil.
`GET /legal/documentos/{documentoId}?version=3` → histórica (opcional).

```json
{ "documentoId": "terminos-comprador", "version": 4, "hash": "sha256:...",
  "titulo": "Términos de uso", "fechaVigencia": "2026-09-01",
  "contenido": { "formato": "texto | html | pdf_url", "valor": "..." },
  "miAceptacion": { "version": 3, "fecha": "2026-05-01T12:00:00Z" } }
```

Errores: `401`, `403 perfil_invalido` (documento de otro perfil),
`404 documento_no_encontrado`.

### B.3 — Aceptar documento

`POST /legal/documentos/{documentoId}/aceptar` con header `Idempotency-Key`:

```json
{ "version": 4, "hash": "sha256:..." }
```

Mismas reglas que A.4: validación de vigencia y hash server-side, registro de
**comprador/cargador id, documento, versión, hash, fecha del servidor** y
auditoría, idempotente por (actor, documento, versión).

`200`

```json
{ "documentoId": "terminos-comprador", "version": 4,
  "estado": "aceptado", "fecha": "2026-10-07T15:30:00Z" }
```

Errores: `401`, `403 perfil_invalido`, `404 documento_no_encontrado`,
`409 version_obsoleta`, `409 hash_mismatch`, `400 cuerpo_invalido`.

### B.4 — Historial (opcional, segunda ola)

`GET /legal/historial` → aceptaciones propias ordenadas por fecha. Opcional
para la primera ola: la app puede mostrar el historial con lo que B.1/B.2 ya
informan (`miAceptacion`).

## Reglas de las apps (no requieren backend, se verifican en e2e)

- **Mostrador**: la sección "Configuración → Suscripción y Legal" existe solo
  en el menú del rol dueño; vendedor y cajero no la ven ni pueden llamar a
  estos endpoints con éxito (403 esperado en pruebas negativas).
- **Aceptación online-only**: si no hay red, el botón de aceptar no registra
  nada localmente; muestra el estado de sin conexión y reintenta contra el
  backend cuando vuelve.
- **Caché identificada**: todo documento cacheado guarda `documentoId +
  version + hash`. Si al reconectar la versión vigente difiere, la app
  descarta la caché y vuelve a consultar; nunca muestra una versión
  invalidada como si fuera vigente, y el hash enviado en la aceptación es
  siempre el que el backend entregó.
- **Nada hardcodeado**: códigos de planes/add-ons/documentos se muestran tal
  como llegan; ningún `if (codigo == "...")` decide comportamiento en la app.
- **Tenant isolation**: los e2e negativos deben demostrar que un tenant A no
  percibe datos del tenant B (la respuesta de A.1 solo contiene datos del
  token) y que las aceptaciones quedan atadas al actor del token.

## Migraciones que Torre necesita crear (borrador referencial, no vinculante)

Sugerencia de modelo mínimo (Torre decide nombres/normalización final):
`planes`, `suscripciones (tenant_id, plan_id, estado, fechas)`,
`suscripcion_addons (tenant_id, addon_codigo, activo, fechas)`,
`documentos (id, tipo, perfil/ambito, titulo)`,
`documento_versiones (documento_id, version, hash, contenido/ref, vigencias)`,
`aceptaciones (actor tipo+id, documento_id, version, hash, fecha,
idempotency_key única)` + disparo de auditoría en cada aceptación. Ninguna de
estas tablas existe hoy; este repo no las crea.
