# Checklist de publicación

Estado del paquete al 2026-10-18. Lo marcado como **verificado** tiene evidencia en
`verificacion/`; lo marcado como **bloqueado** necesita una decisión o un dato del titular,
no código.

## 1. Artefactos

| Item | Estado | Evidencia |
|---|---|---|
| AAB Mostrador 0.2.1 (code 3) firmado con la clave de subida | verificado | `verificacion/firmas.log`, `paquetes.json` |
| AAB Mercado 1.0.1 (code 2) firmado con la clave de subida | verificado | ídem |
| APK de QA instalables | verificado | `mercado-login-limpio.png`, instalados en el emulador |
| `flutter analyze` sin errores en ambas apps | verificado | `mostrador-analyze.log`, `mercado-analyze.log` |
| Suite de tests en verde | verificado | `mostrador-tests.log`, `mercado-tests.log` (44/44 Mercado) |
| targetSdk 36 / minSdk 24 | verificado | manifiesto fusionado del build release |

## 2. Identidad del responsable (bloqueado en el titular)

`repoweb/public/apps/config-publica.js` está vacío a propósito. Mientras siga así, las
cuatro páginas se muestran como borrador y los botones de contacto quedan inhabilitados.

- [ ] Razón social o nombre y apellido del responsable
- [ ] CUIT
- [ ] Domicilio legal
- [ ] Correo de soporte **atendido** (Play lo muestra en la ficha y lo verifica)
- [ ] Correo de privacidad
- [ ] Fecha de vigencia de los documentos
- [ ] Plazos reales: respuesta de soporte, derechos ARCO, borrado de cuenta
- [ ] Política de retención por tipo de dato (la tabla de la política)
- [ ] `revisionLegalAprobada: true` después de la lectura jurídica
- [ ] `canalHumanoVerificado: true` después de ensayar el procedimiento con un correo real

## 3. Eliminación de cuenta (bloqueado, es política de Play)

Play exige que una app con cuentas propias ofrezca un camino de eliminación **dentro de la
app o en la web**, autoservido. Hoy la app enlaza a una página que pide escribir un correo,
y del lado del servidor no existe el borrado en cascada.

- [ ] Endpoint de borrado en `app/` que elimine o anonimize: credenciales, sesión, pedidos,
      mensajes, archivos de identidad y foto de perfil, dejando lo que la ley obliga a conservar
- [ ] Botón o pantalla de eliminación en Mercado al Toque (y en Mostrador para el personal)
- [ ] Página `eliminar-cuenta.html` sin la advertencia de borrador
- [ ] Declaración de eliminación de cuenta marcada en Play Console

## 4. Backend (bloqueado)

El paquete apunta a `https://mostrador-api.vercel.app` conectado a la base **Neon DEV**.

- [ ] Base de producción separada de DEV
- [ ] Variables de entorno de producción (Resend, Turnstile, Qwen/DeepSeek) confirmadas
- [ ] `API_BASE_URL` de producción y rebuild de los AAB con ese valor
- [ ] Cuentas demo que un revisor pueda usar sin romper datos reales, o registro abierto

## 5. Sitio legal publicado (en curso)

`https://mostrador-xi.vercel.app/apps/…` responde 404 hasta que la carpeta
`repoweb/public/apps/` llegue al deploy.

- [ ] Publicar y verificar las cuatro URLs con `curl -I` (200, no 307 a login)
- [ ] Probar los enlaces desde la app instalada

## 6. Play Console (cuenta)

- [ ] Cuenta de desarrollador creada y verificada (arancel único, verificación de identidad de Google)
- [ ] Decidir si Play gestiona la clave de firma (App Signing, recomendado): los keystore
      actuales son de subida y provisorios
- [ ] Volver a subir si se cambia el `applicationId`: `com.frutasroman.puesto_flutter` y
      `ar.grok.mostrador.mercado_al_toque` quedan atados a la cuenta para siempre
- [ ] Prueba interna → cerrada → producción

## 7. Formularios por app

- [ ] Ficha de tienda: ver `ficha-mostrador.md` y `ficha-mercado.md`
- [ ] Seguridad de los datos: ver `seguridad-de-datos.md`
- [ ] Cuestionario de contenido (IARC)
- [ ] Permisos y funciones del dispositivo: Mostrador declara `CAMERA` (tomar la foto del remito)
- [ ] Declaración de audiencia: no dirigido a niños
- [ ] Gráficos: ícono 512×512, imagen de cabecera 1024×512, mínimo dos capturas por app
- [ ] Correo y teléfono de contacto del desarrollador

## 8. Riesgos conocidos

- La selfie y la foto del documento que pide Mercado al Toque son **datos de identidad**;
  Play los trata como sensibles y hay que declararlos con su finalidad y si se cifran en tránsito.
- El OCR de remitos usa un proveedor externo: si el puesto lo activa, aparece una cesión más
  que declarar.
- Los enlaces de `eliminar-cuenta.html` y `soporte.html` no funcionan hasta completar el punto 2;
  un revisor que los pruebe va a encontrar la página en borrador.
