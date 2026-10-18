# Play Store · paquete de publicación

Generado el 2026-10-18 contra el backend en Vercel (`mostrador-api.vercel.app`).

| Carpeta | Qué hay |
|---|---|
| `android/mostrador/` | AAB firmados para subir + APK de QA de **Mostrador** (puesto) |
| `android/mercado/` | AAB firmados para subir + APK de QA de **Mercado al Toque** (comprador/cargador) |
| `documentacion/` | Fichas de tienda, formulario de seguridad de datos y checklist de subida |
| `verificacion/` | Logs de `analyze`, `test` y `build`, capturas de la app corriendo e informe de firmas |

## Reproducir el paquete

```
node entrega-prueba/play-store/herramientas/firma-upload.mjs crear <mostrador|mercado>
node entrega-prueba/play-store/herramientas/build-android.mjs   [mostrador|mercado]
node entrega-prueba/play-store/herramientas/verificar-paquetes.mjs
```

`DELIVERY_DIRECTORY` define la carpeta de salida; por defecto el Escritorio. Las cuatro
variables `ANDROID_*` de firma no se guardan en el repo: `firma-upload.mjs` las toma de un
keystore local protegido con DPAPI y las inyecta sólo al proceso de Gradle. Sin esas
variables, `build.gradle.kts` corta el build release en vez de firmar con debug.

## Antes de subir

Leer `documentacion/checklist-publicacion.md`. El paquete está listo para **subir a una
prueba interna**, no para producción: faltan las decisiones del titular que la propia
página legal marca como pendientes.
