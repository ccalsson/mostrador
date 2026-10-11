# Mostrador — builds de prueba contra la nube (NO producción)

Fecha de entrega: 2026-10-11 (re-empaquetado) · Versión app: **0.2.0+2** · Commit: **2a30a1d**

## Qué es esto

Instalables del cliente Flutter (Android vendedor / Windows Caja-Admin) y de
Mercado Al Toque (Android) para probar **físicamente** en el negocio.
**No** es producción: no se deployó la web, la infraestructura no cambió y la
base de datos sigue siendo **Neon DEV** (descartable).

## Novedades de esta entrega

- **Ya no dependen de la PC de desarrollo.** Los builds apuntan a la API
  pública en la nube (`https://mostrador-api.vercel.app`, deployment de
  Vercel) conectada a la misma Neon DEV. La PC puede estar apagada.
- **Nuevo: APK de Mercado Al Toque** (1.0.0), también contra la API pública.
- Todo lo de la entrega 0.2.0 del mismo día se mantiene: remitos (alta manual;
  OCR no habilitado en DEV), reportes, proveedores, edición de clientes y
  pagos de cuenta corriente, anulaciones de pedidos/ventas, y Caja marcando
  pedidos listos.

## Backend utilizado (importante)

- API/backend: **https://mostrador-api.vercel.app** (proyecto Vercel
  `mostrador-api` de este repositorio, carpeta `app/`).
- Base de datos: **Neon DEV** (rama de desarrollo, sin tocar producción).
- **La PC de desarrollo ya no participa**: no hace falta encenderla, ni
  firewall, ni estar en la misma red.

### URL/API configurada en los builds

| Build | API_BASE_URL compilada |
|---|---|
| Android Mostrador (APK) | `https://mostrador-api.vercel.app` |
| Windows Mostrador (instalador) | `https://mostrador-api.vercel.app` |
| Android Mercado Al Toque (APK) | `https://mostrador-api.vercel.app/api/mercado/v1` |

## Requisitos previos

1. **Internet** en el dispositivo (WiFi del negocio o datos móviles). Nada más:
   no hace falta PC encendida, ni firewall, ni misma red local.
2. La PC Windows limpia necesita **Windows 10/11 x64** (incluye el runtime
   Visual C++ que usa la app). No requiere instalar nada más.

## Instalación

### Android (vendedor)

1. Copiar `Mostrador-0.2.0-dev.apk` al teléfono (USB, Drive, WhatsApp a uno
   mismo, etc.).
2. Abrir el APK desde el teléfono. Si pide permiso: *Configuración → Permitir
   instalar apps de orígenes desconocidos* para el gestor de archivos usado.
3. Abrir la app **Mostrador**, loguearse (credenciales abajo).
4. El icono queda en el lanzador como cualquier app.

### Windows (Caja/Admin)

1. Copiar `Mostrador-Windows-0.2.0-dev.zip` a la PC.
2. **Descomprimir el zip** en cualquier carpeta. Adentro hay un `Instalar.cmd`,
   un `Desinstalar.cmd` y la carpeta `Mostrador\`.
3. Doble clic en `Instalar.cmd`: copia la app a `%LOCALAPPDATA%\Mostrador` y
   crea el acceso directo **Mostrador** en el Escritorio y en el menú Inicio.
4. Abrir desde ese acceso directo y loguearse.

### Android (Mercado Al Toque)

1. Copiar `Mercado-Al-Toque-1.0.0-dev.apk` al teléfono e instalarlo igual que
   el APK de Mostrador.

## Credenciales de prueba (seed DEV)

| Rol | Email | Password |
|---|---|---|
| Dueño/Admin | `dueno@frutasroman.com` | `roman2026` |
| Vendedor | `venta@frutasroman.com` | `roman2026` |
| Caja | `caja@frutasroman.com` | `roman2026` |

## Circuito a validar

1. Vendedor (Android) arma pedido desde el catálogo y lo confirma.
2. Caja (Windows) ve el pedido en la bandeja, lo marca listo si hace falta, lo
   cobra (efectivo con vuelto / transferencia / débito / crédito), imprime el
   ticket (diálogo del sistema, 80 mm).
3. Admin (Windows) ve dashboard, productos, stock, usuarios, clientes, proveedores,
   remitos, reportes y auditoría; el stock descuenta con los pedidos.
4. Admin carga un remito a mano (proveedor + líneas) y confirma el ingreso.
5. Admin registra un pago de cuenta corriente y/o anula un pedido o venta.
6. Mercado Al Toque (Android): navegar puestos/avisos/ranking y, si hay
   credenciales de comprador/cargador de prueba, el flujo de la app.

## Notas de uso

- **Login con rate limit**: si se hacen varios intentos de login seguidos
  (p. ej. cambiar de usuario varias veces, o probar credenciales inválidas),
  el servidor puede responder "Too many requests". Esperar ~10 segundos y
  reintentar; es una protección normal de la API pública.
- La API pública es serverless: el primer acceso tras un rato de inactividad
  puede tardar 1-2 segundos de más.

## Cómo actualizar / reinstalar

- **Android:** instalar el APK nuevo encima del anterior; no se pierden datos
  (el login queda guardado). Si falla, desinstalar e instalar de nuevo.
- **Windows:** descomprimir el zip nuevo y ejecutar `Instalar.cmd` otra vez;
  pisa la versión anterior sin tocar nada más. Para desinstalar: ejecutar
  `Desinstalar.cmd` (el del zip o el que queda en `%LOCALAPPDATA%\Mostrador`);
  borra la app, los accesos directos y se limpia solo.

## Recompilar apuntando a otra URL

```bat
cd clients/puesto_flutter
flutter build apk --release --dart-define=API_BASE_URL=https://mostrador-api.vercel.app --dart-define=API_AUTH_ORIGIN=https://mostrador-api.vercel.app
flutter build windows --release --dart-define=API_BASE_URL=https://mostrador-api.vercel.app --dart-define=API_AUTH_ORIGIN=https://mostrador-api.vercel.app

cd clients/mercado_flutter
flutter build apk --release --dart-define=API_BASE_URL=https://mostrador-api.vercel.app/api/mercado/v1 --dart-define=API_AUTH_ORIGIN=https://mostrador-api.vercel.app
```

> El backend (en Vercel) debe aceptar el origen: `BETTER_AUTH_URL` está fijada
> en las variables de entorno del proyecto `mostrador-api` (Production). Si se
> cambia el dominio de la API, actualizarla ahí y redesplegar.

## Alcance y limitaciones conocidas (DEV)

- OCR de remitos: **no habilitado** en el servidor DEV (falta la clave del
  proveedor). El alta de remitos es manual; la foto/archivo avisa que la
  lectura no está disponible.
- Impresión: diálogo del sistema de Windows (PDF 80 mm). La impresora
  térmica directa queda pendiente de definir hardware.
- El vendedor necesita conexión (no hay modo offline todavía).
- Todo lo que se cargue/cobre es contra la base **DEV** (descartable); no es
  producción y los datos pueden borrarse sin aviso.
