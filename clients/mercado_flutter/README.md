# Mercado al Toque (app Flutter)

App móvil del canal "Mercado al Toque": compradores piden a los puestos y
cargadores arman y completan recorridos de entrega. Un solo binario con dos
perfiles (comprador y cargador); la preparación de pedidos queda en la app del
puesto (`clients/puesto_flutter`).

Versión: 1.0.0+1 · Package: `ar.grok.mostrador.mercado_al_toque`

## Requisitos

- Flutter stable (el mismo del repo; ver `clients/puesto_flutter/README.md`)
- Backend corriendo: `cd app && npm run dev` (escucha en `:8080`) contra la
  base DEV (Neon) con la migración `0009_mercado.sql` aplicada
- Un dispositivo/emulador Android en la misma red que la máquina del backend

## Configuración del entorno

La app apunta a la API del canal por `--dart-define`:

```
API_BASE_URL (default: http://192.168.0.101:8080/api/mercado/v1)
```

Para apuntar a otra máquina (por ejemplo el emulador usa `10.0.2.2` para
llegar al host):

```
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080/api/mercado/v1
```

No hay secretos en el cliente: la sesión es un token Bearer que `auth/ingreso`
entrega y `flutter_secure_storage` guarda en el dispositivo.

## Correr en DEV

```
cd clients/mercado_flutter
flutter pub get
flutter run                # elige el dispositivo
```

Perfiles de prueba: el registro de comprador y de cargador se hace desde la
propia app (pantalla de ingreso). El perfil staff (preparación de pedidos)
se maneja desde `puesto_flutter` o por HTTP con el usuario de pruebas DEV.

## Compilar la APK

```
cd clients/mercado_flutter
flutter build apk --release
```

Salida: `build/app/outputs/flutter-apk/app-release.apk` (firmada con la clave
debug, apta sólo para pruebas internas). Instalar con:

```
adb install build/app/outputs/flutter-apk/app-release.apk
```

## Tests

```
flutter test                                    # unitarios + widget
flutter analyze
flutter test integration_test/canal_flow_test.dart -d <dispositivo>
```

El test de integración ejecuta el ciclo completo contra la API DEV real:
compra en UI → checkout en efectivo → preparación staff → armado de recorrido
→ aceptar/retirar/entregar del cargador → calificación del comprador.
Requiere el backend arriba y deja datos de prueba en DEV.

## Endpoints que consume (`/api/mercado/v1`)

| Grupo      | Endpoint |
|------------|----------|
| Auth       | `POST auth/ingreso`, `POST auth/registro`, `POST auth/registro-cargador`, `POST auth/google`, `POST auth/salir`, `GET yo` |
| Catálogo   | `GET puestos`, `GET puestos/{tenantId}/productos` |
| Comprador  | `GET pedidos`, `GET pedidos/{pedidoId}`, `POST pedidos` (checkout con `Idempotency-Key`) |
| Cargador   | `GET cargadores`, `GET recorridos`, `POST cargador/disponibilidad`, `POST recorridos` (con `Idempotency-Key`), `POST recorridos/{id}/aceptar`, `POST recorridos/{id}/rechazar`, `POST recorridos/{id}/retirar`, `POST recorridos/{id}/entregar` |
| Calificar  | `POST recorridos/{id}/calificar` |
| Identidad  | `POST identidad` (documento + selfie en base64) |

Las acciones mutantes de recorrido y el checkout usan `Idempotency-Key`
persistida en el dispositivo: un reintento tras corte de red no duplica
pedidos ni recorridos.

## Cambios de backend que esta app requiere

- Migración `0009_mercado.sql` (tablas `mercado_*`: puestos/productos del
  canal, pedidos, recorridos, cargadores, puntos, calificaciones, identidad).
- `app/src/lib/server/mercado.ts`: API del canal con estados mapeados
  (`buyerOrderState`) — el cliente sólo recibe estados de UI, nunca crudos.
- Endurecimiento de seguridad (commit `65cec53`): `assertPerfil` centraliza la
  autorización por perfil y las operaciones sensibles (entrega, calificación,
  alta de recorrido) escriben auditoría.

## Windows

Evaluado y descartado por ahora: el canal es móvil por diseño (el comprador y
el cargador usan cámara y ubicación en el mercado) y `image_picker` (fotos de
identidad) no tiene implementación Windows, así que el flujo de identidad no
funcionaría en desktop. Si algún día se requiere, el punto de partida es
reemplazar `image_picker` por `file_selector` en desktop.

## Estado de pruebas (2026-10-07)

- Unitarios + widget: `flutter test` verde (modelos 17/17 + widget tests de
  pantallas con API falsa).
- `flutter analyze`: sin issues.
- Backend ciclo real completo (script `app/scripts/tmp-mercado-e2e.mjs`):
  41 PASS / 0 fallos contra Neon DEV — incluye entrega con punto al cargador y
  calificación.
- Seguridad: 8 tests negativos (autorización cruzada de perfiles) PASS.
- E2E de UI (corrida 21): ciclo completo comprador→staff→cargador→calificación
  "All tests passed" sobre emulador Android + Neon DEV.

## Estructura

```
lib/
  main.dart          shell por perfil (comprador/cargador) + ingreso/registro
  market_api.dart    cliente HTTP tipado + cachés 45 s + idempotencia
  models.dart        modelos del canal (fromWire estricto contra estados crudos)
  screens/           stands, cart, buyer_orders, courier, profile
  widgets/common.dart
test/                unitarios de modelos y widget tests con MercadoApi falsa
integration_test/    ciclo completo contra DEV
```
