# Seguridad de los datos (formulario de Play)

Respuestas para ambas apps, verificadas contra el código del 2026-10-18. Cada renglón dice
de dónde sale: si no está en el código, no se declara.

**Común a las dos apps:** los datos viajan por HTTPS (TLS) contra `mostrador-api.vercel.app`.
El token de sesión se guarda en `flutter_secure_storage` (keystore del dispositivo). No hay
Firebase, AdMob, SDK de analítica ni de publicidad embebido en el paquete: se puede
reproducir con `grep -ri "firebase\|admob\|play-services\|analytics" clients/*/android clients/*/pubspec.yaml`.

---

## Mostrador (`com.frutasroman.puesto_flutter`)

| Tipo de dato | ¿Se recoge? | Finalidad | Se comparte | Cifrado en tránsito | Cifrado en reposo | Se borra con la cuenta |
|---|---|---|---|---|---|---|
| Nombre | Sí | Cuenta, registro de quién hizo cada movimiento | No | Sí | No verificado | Pendiente |
| Correo electrónico | Sí | Ingreso, confirmación de alta, recuperación | Sí (Resend, para enviar el correo) | Sí | No verificado | Pendiente |
| Teléfono | No | — | — | — | — | — |
| Dirección IP y user-agent | Sí | Seguridad y límite de intentos | No | Sí | No verificado | Pendiente |
| Tokens de sesión | Sí | Mantener la sesión | No | Sí | No verificado | Sí (al cerrar sesión) |
| Actividad en la app | Sí | Registrar pedidos, cobros y movimientos del puesto | No | Sí | No verificado | Pendiente |
| Fotos | Sí | Fotografíar remitos, si el usuario elige hacerlo | No | Sí | No verificado | Pendiente |
| Documentos | Sí | El remito cargado | No | Sí | No verificado | Pendiente |
| Mensajes | No | — | — | — | — | — |
| Ubicación | No | — | — | — | — | — |
| Información financiera | No | El cobro lo registra el puesto; la app no procesa pagos | — | — | — | — |
| Contactos, calendario, audio, video, IDs de dispositivo | No | — | — | — | — | — |

Fuente: `lib/features/auth/login_screen.dart:100-134` (correo y contraseña),
`lib/features/admin/usuario_form_dialog.dart:50-71` (nombre, correo, contraseña, rol),
`lib/services/remito_imagen.dart:10-16` + `android/app/src/main/AndroidManifest.xml:2-4`
(permiso `CAMERA`), `app/migrations/0001_auth.sql:29-38` (`ipAddress`, `userAgent` por sesión).

## Mercado al Toque (`ar.grok.mostrador.mercado_al_toque`)

| Tipo de dato | ¿Se recoge? | Finalidad | Se comparte | Cifrado en tránsito | Cifrado en reposo | Se borra con la cuenta |
|---|---|---|---|---|---|---|
| Nombre | Sí | Cuenta, identificación en el mercado | No | Sí | No verificado | Pendiente |
| Correo electrónico | Sí | Ingreso, confirmación de alta, recuperación | Sí (Resend) | Sí | No verificado | Pendiente |
| Teléfono | Sí | Contacto del pedido y de la tarea de carga | No | Sí | No verificado | Pendiente |
| Documento de identidad (DNI / CI) | Sí | Identificar al comprador en un mercado mayorista | No | Sí | No verificado | Pendiente |
| Foto del documento y selfie | Sí | Verificación de identidad iniciada por el usuario | No | Sí | **No**: se guardan como `bytea` en la base | Pendiente |
| Foto de perfil | Sí, opcional | Mostrarla en la cuenta | No | Sí | No verificado | Pendiente |
| Dirección IP | Sí | Seguridad y límite de intentos | No | Sí | No verificado | Pendiente |
| Tokens de sesión | Sí | Mantener la sesión (`token_hash`) | No | Sí | Hash, no texto | Sí (deja de servir al cerrar) |
| Mensajes | Sí | Chat entre comprador y puesto sobre un pedido | No | Sí | No verificado | Pendiente |
| Actividad en la app | Sí | Pedidos, entregas confirmadas y calificaciones | No | Sí | No verificado | Pendiente |
| Ubicación | No | — | — | — | — | — |
| Información financiera | No | El pago se hace con el puesto; se guarda el *estado* del pago, no la tarjeta | — | — | — | — |
| Contactos, calendario, audio, IDs de dispositivo | No | — | — | — | — | — |

Fuente: `app/public/registro-mercado.html:11-17` (campos del alta),
`app/migrations/0009_mercado.sql:18-49` (compradores y cargadores),
`0009_mercado.sql:51-59` (credenciales y `google_subject`),
`0009_mercado.sql:61-67` (`mercado_archivos`: documento y selfie),
`0016_mercado_fotos.sql:6-14` (foto de perfil),
`lib/market_api.dart:349-362` (subida de identidad),
`android/app/src/main/AndroidManifest.xml:1-2` (sólo permiso `INTERNET`).

---

## Terceros declarados

| Proveedor | Qué trata | Para qué |
|---|---|---|
| Neon / AWS | Base de datos completa | Alojar cuentas, pedidos y archivos |
| Resend | Correo electrónico del usuario | Confirmación de alta y recuperación de contraseña |
| Cloudflare Turnstile | Dirección IP y token del captcha | Verificar que el alta la hizo una persona |
| Google | Nombre, identificador de cuenta y correo verificado | Iniciar sesión con la cuenta de Google, si el usuario lo elige |
| Proveedor de OCR | Imagen del remito | Reconocer el texto, sólo si el puesto activa la función |

## Lo que todavía no se puede responder bien en el formulario

- **"El desarrollador puede borrar los datos por solicitud del usuario"**: hoy no existe el
  borrado en cascada del lado del servidor. Ver `checklist-publicacion.md`, punto 3.
- **"Cifrado en reposo"**: la base está en Neon y los archivos de identidad se guardan como
  `bytea` sin cifrado propio; hay que confirmar qué garantiza el plan antes de marcar "sí".
- **Los datos de identidad son sensibles**: declarar mal la selfie o el documento es de los
  motivos más frecuentes de rechazo. No marcar "no se comparte con terceros" si el puesto,
  como persona distinta del responsable, llega a verlos.
