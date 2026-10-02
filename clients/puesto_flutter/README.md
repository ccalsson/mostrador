# Mostrador — puesto de venta (Flutter)

Cliente Flutter multiplataforma del backend Mostrador (TanStack Start):
Android para vendedor, Windows para caja/administración.
Estado: **Fase 2** — fundaciones, auth, sesión y catálogo read-only.

## Requisitos

- Flutter stable (probado con 3.47.6).
- Backend DEV corriendo en `http://127.0.0.1:8080` (`npm run dev` en `app/`
  del repo, con su `.env`).
- Usuario demo (DEV): `caja@frutasroman.com` / `roman2026`
  (también `venta@frutasroman.com` y `dueno@frutasroman.com`).

## Correr

| Plataforma | Comando |
| --- | --- |
| Windows | `flutter run -d windows` |
| Emulador Android | `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080` |

El emulador Android llega al host por `10.0.2.2`; por eso la URL se define por
entorno y nunca se hardcodea. En Android debug el manifest permite cleartext
HTTP sólo para desarrollo (`android/app/src/debug/AndroidManifest.xml`).

## Configuración (`--dart-define`)

| Define | Default | Uso |
| --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:8080` | Base del backend (sin barra final). |
| `API_AUTH_ORIGIN` | `http://localhost:8080` | `Origin` que Better Auth exige en sign-in/sign-out. |
| `E2E_EMAIL` / `E2E_PASSWORD` | `caja@frutasroman.com` / `roman2026` | Sólo para el integration test. |

## Calidad

```bash
flutter analyze
flutter test                                            # unit: ApiClient
flutter test integration_test -d windows                # e2e con backend DEV
flutter build apk --debug                               # verificación Android
```

## Seguridad

- El token de sesión vive en almacenamiento seguro del SO
  (Android Keystore / Windows Credential Locker), nunca en disco ni en git.
- Sin secretos hardcodeados: todo llega por configuración (`--dart-define`).
- El cliente no implementa autorización de negocio: el servidor decide qué
  puede ver y hacer cada rol.
