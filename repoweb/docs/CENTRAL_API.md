# API central para Mostrador y Mercado al Toque

Fuente de verdad: este backend y PostgreSQL (`torre.*`). Flutter no calcula precios, hashes ni contratos, y no acepta offline.

La aceptación es electrónica. No es una firma digital certificada. Los textos jurídicos siguen en borrador hasta que Legal los publique desde Torre. La redacción definitiva queda para revisión de un abogado. La arquitectura no clasifica responsable ni encargado: eso está anotado como pendiente de revisión jurídica en `torre.saas_processors`.

## Autenticación y tenant

Mostrador: sesión de Better Auth del personal del puesto (`staff`). El tenant de Torre se resuelve solo por `saas_tenants.operational_tenant_ref` igual al `tenant_id` operativo. Si no hay vínculo: `404 tenant_not_linked`.

Mercado al Toque: `Authorization: Bearer` de `POST /api/mercado/v1/auth/ingreso`. El perfil `comprador` o `cargador` define la audiencia. No ve la suscripción del puesto. No existe el rol "changarín".

Un actor nunca recibe filas de otro tenant ni de otra audiencia. El filtro no está en Flutter: la API resuelve el tenant desde la sesión.

Torre (consola interna) no usa estos endpoints. Usa server functions con `torreGuard` y un rol de `torre.saas_access`:

| Rol | Puede |
|---|---|
| administracion | comercial, legal, acceso, lectura, auditoría |
| comercial | comercial y lectura. No publica contratos |
| legal | legal y lectura. No cambia precios |
| soporte | solo lectura |
| auditoria | lectura y auditoría. No modifica |

## Errores

```json
{ "error": { "code": "unauthenticated", "message": "..." } }
```

| HTTP | code | Cuándo |
|---|---|---|
| 401 | unauthenticated | Sin sesión |
| 403 | not_a_tenant | Comprador o cargador pide la suscripción del puesto |
| 404 | tenant_not_linked | El puesto no está vinculado en Torre |
| 404 | subscription_not_found | No hay suscripción |
| 404 | not_found | Contrato o documento ajeno, o ruta inexistente |
| 409 | already_accepted | Aceptación repetida |
| 409 | not_pending | El contrato no está pendiente |
| 409 | hash_mismatch | El snapshot no coincide con el hash guardado |
| 500 | internal | Fallo no clasificado |

## Endpoints

Base: `/api/central/v1`

### GET /subscription

Solo Mostrador.

```json
{
  "subscription": {
    "id": "sub_...",
    "status": "active",
    "plan": { "code": "plan-base", "name": "Base", "currency": "ARS", "periodicity": "monthly" },
    "startDate": "2026-10-07",
    "nextPaymentDate": null,
    "lines": [{
      "id": "lin_...",
      "product": "Mercado al Toque Presencia",
      "code": "mercado-presencia",
      "kind": "addon",
      "quantity": 1,
      "unitPrice": 32,
      "effectivePrice": 0,
      "amountDue": 0,
      "bonus": 32,
      "discount": 0,
      "frozen": true,
      "currency": "USD",
      "frequency": "monthly",
      "charge": "recurring",
      "subtotal": 32,
      "status": "active",
      "startsOn": "2026-10-07",
      "endsOn": null,
      "adjustments": [{ "kind": "bonus", "percent": 100, "amount": null, "startsOn": "2026-10-07", "endsOn": "2027-04-07", "status": "active" }]
    }],
    "grants": [{ "code": "fundador-mercado", "startsOn": "2026-10-07", "endsOn": "2027-10-07", "conditions": "..." }],
    "commissionOverrides": [{ "percent": 0, "startsOn": "2026-10-07", "endsOn": "2027-04-07", "status": "active" }]
  }
}
```

Usar `amountDue` como importe a cobrar de esa línea. `unitPrice` es el precio contratado y no se pisa. `subtotal` es cantidad por precio contratado, antes de bonificación. No recalcular en Flutter.

`charge`: `setup` es implementación. `recurring` con `frequency: monthly` es abono. `frequency: once` es un cargo puntual (publicidad o push) y no es un abono.

Estados de suscripción: `pending`, `active`, `past_due`, `paused`, `suspended`, `cancelled`. Los pasa Torre. No hay cobro automático que los mueva.

### GET /addons

Líneas activas cuyo producto no es `base_product`. Misma sesión y la misma forma de línea que arriba.

### GET /legal-documents

Versiones publicadas de la audiencia del actor. Privacidad es común. El SaaS del puesto no aparece para comprador ni cargador.

```json
{ "documents": [{ "id": "...", "code": "mercado-comprador", "title": "...", "audience": "mercado_comprador", "versionId": "...", "version": "1.0", "hash": "...", "reacceptOnChange": true }] }
```

Audiencias separadas: `saas_b2b` (puesto con el proveedor), `mercado_comprador`, `mercado_cargador`, `privacy`, `other`.

### GET /contracts/pending

Mostrador: solo un contrato `pending` ofrecido a su tenant, o privacidad publicada sin aceptación si el documento exige reaceptar.

Mercado: versión publicada de su audiencia que todavía no aceptó. Si `reacceptOnChange` es falso y ya aceptó una versión anterior, no vuelve a figurar.

Un documento en borrador no se ofrece ni se acepta.

### GET /contracts/current

Documentos cuya versión publicada coincide con un hash ya aceptado.

### GET /contracts/history

Hashes aceptados por ese tenant o, en Mercado, por ese usuario.

### GET /contracts

`pending` y `history` juntos.

### POST /contracts/{id}/accept

No funciona offline. El servidor vuelve a hashear el snapshot. Si no coincide: `409 hash_mismatch`.

Mostrador: `{id}` es el contrato ofrecido (`saas_tenant_contracts`). Mercado: `{id}` es la versión publicada.

```json
{ "acceptanceId": "acc_...", "hash": "...", "action": "electronic_acceptance" }
```

Se guardan fecha UTC, usuario, hash, IP y user-agent. La fila de aceptación no se edita ni se borra.

## Reglas de negocio

- Catálogo (`saas_products`) y planes (`saas_plans`) se editan en Torre. Una línea ya contratada no cambia si cambia el catálogo.
- El `monthly_price` histórico del plan Base (ARS 45000 en el puesto semilla) no es el precio de los clientes nuevos. La propuesta vigente está en el catálogo, en USD: Mostrador Base 975 de implementación y 100 mensuales; sucursal extra 25; Presencia 32; Pro 65; push 10k 20; push 50k 65; banner home 50; banner categoría 25; destacado 13. Esos números viven en Postgres, no en Flutter.
- Implementación (`charge: setup`), abono, add-on, publicidad y push son líneas distintas.
- Bonificación, descuento, precio congelado y comisión van en `saas_price_adjustments`. No se escriben encima de `unit_price`.
- La promoción `fundador-mercado` nace en borrador y sin asignar. Hay que activarla y asignarla a un tenant. No está limitada a "los dos primeros". Al asignarla, el servidor materializa 6 meses de bonificación de Presencia/Pro, 0% de comisión en esa ventana y precio congelado 12 meses, si el config de la plantilla sigue diciendo eso.
- Durante el congelamiento no se puede cambiar el unitario ni reemplazar esa línea por el precio nuevo del catálogo.
- Un documento en borrador no se ofrece ni se acepta.
- Cambiar el cuerpo de una versión publicada está bloqueado en la base. Hay que publicar otra etiqueta. La versión vieja y su hash quedan.
- El snapshot aceptado no se reescribe. El estado del contrato puede pasar a `accepted`, `superseded` o `cancelled`.
- `reacceptOnChange` decide si una versión nueva obliga a aceptar de nuevo.
- Estados de suscripción: de nueva, solo `pending` o `active`. Desde `active` se puede ir a `past_due`, `paused`, `suspended` o `cancelled`. `cancelled` no vuelve atrás.
- La auditoría (`saas_audit`) es append-only. Torre solo la lista.

## Lo que consumen Mostrador y Mercado

`pending` y `current` incluyen `body`, el texto que se acepta. Si no viene, el cliente no acepta.

`GET /capabilities` es solo del puesto. Devuelve `tier` (`presencia`, `pro` o null), si hay presencia, si la cuenta corriente está habilitada (solo Pro), la comisión vigente (un override o la banda de la política, nunca un importe), los packs y los avisos. Mercado no puede pedirla.

Un puesto aparece en Mercado si está publicado en Mostrador y Torre tiene una línea activa de familia `mercado` con suscripción `active` o `past_due`. Los avisos de esa condición están en `GET /api/mercado/v1/avisos`. Al confirmar un pedido, el servidor copia la comisión en `pedidos.condicion` y no la resta del precio de la mercadería.

## Pendiente

- PDF del contrato. Hoy la prueba es el texto y el hash, no un archivo. No generar el PDF jurídico en Flutter.
- Redacción jurídica. Los documentos semilla no tienen cuerpo publicado.
- Cobro automático y proveedor de pagos. Nada pasa solo a `past_due`.
- El cliente Flutter de actualizaciones sigue en `GET /api/releases/{app}/{platform}/manifest`.
