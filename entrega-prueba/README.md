# Mostrador — builds de prueba contra DEV (NO producción)

Fecha de entrega: 2026-10-11 · Versión app: **0.2.0+2** · Commit: (se completa al publicar)

## Qué es esto

Instalables del cliente Flutter (Android vendedor / Windows Caja-Admin) para
probar **físicamente** en el negocio. **No** es producción: no se deployó
nada y la infraestructura no cambió. La base de datos es **Neon DEV** y el
backend corre **en la PC de desarrollo**.

## Novedades de esta entrega (0.2.0, sobre la 0.1.0 del 2026-10-06)

- **Remitos (nuevo)**: ingreso de mercadería con proveedor y líneas; listado y
  detalle con confirmación. La lectura automática por foto (OCR) todavía no
  está habilitada en el servidor DEV: el alta es **manual** por ahora.
- **Reportes (nuevo, Admin)**: dashboard con períodos (7/30/90 días), ventas
  por producto y ranking de cargadores.
- **Proveedores (nuevo, Admin)**: alta, edición y baja del directorio.
- **Clientes**: edición y registro de pagos de cuenta corriente.
- **Anulaciones**: pedidos y ventas se pueden anular desde Admin/Caja.
- **Pedidos**: Caja también puede marcar pedidos como listos, además de cobrarlos.

## Backend utilizado (importante)

- Base de datos: **Neon DEV** (rama de desarrollo, sin tocar producción).
- API/backend: TanStack Start de este repositorio (`app/`), levantado con
  `npm run dev`, escuchando en **todas las interfaces** (`--host 0.0.0.0`, puerto 8080).
- **Mientras la app esté en uso, la PC de desarrollo debe estar encendida con
  el backend corriendo.** Si se apaga o se cierra, los clientes no conectan.

### URL/API configurada en los builds

| Build | API_BASE_URL compilada |
|---|---|
| Android (APK) | `http://192.168.0.101:8080` |
| Windows (instalador) | `http://192.168.0.101:8080` |

`192.168.0.101` es la IP LAN actual de la PC de desarrollo. Si la IP cambia
(router DHCP), hay que recompilar los builds con la nueva IP (ver abajo) o
fijar la IP de la PC.

## Requisitos previos en el negocio

1. **PC de desarrollo** encendida, con el backend corriendo:
   ```bat
   cd app
   npm run dev
   ```
2. **Firewall de Windows** permitiendo entrada al 8080 (sólo la primera vez,
   requiere administrador; o aceptar el diálogo de Windows cuando aparezca):
   ```bat
   netsh advfirewall firewall add rule name="Mostrador DEV backend 8080" dir=in action=allow protocol=TCP localport=8080
   ```
3. **Misma red local** (WiFi del negocio) para el teléfono Android y la PC Windows.
4. La PC Windows limpia necesita **Windows 10/11 x64** (incluye el runtime
   Visual C++ que usa la app). No requiere instalar nada más.

## Instalación

### Android (vendedor)

1. Copiar `Mostrador-0.2.0-dev.apk` al teléfono (USB, Drive, WhatsApp a uno
   mismo, etc.).
2. Abrir el APK desde el teléfono. Si pide permiso: *Configuración → Permitir
   instalar apps de orígenes desconocidos* para el gestor de archivos usado.
3. Abrir la app **Mostrador**, loguearse (credenciales abajo).
4. El icono queda en el lanzador como cualquier app (es el "acceso directo").

### Windows (Caja/Admin)

1. Copiar `Mostrador-Windows-0.2.0-dev.zip` a la PC.
2. **Descomprimir el zip** en cualquier carpeta. Adentro hay un `Instalar.cmd`
   y la carpeta `Mostrador\`.
3. Doble clic en `Instalar.cmd`: copia la app a `%LOCALAPPDATA%\Mostrador` y
   crea el acceso directo **Mostrador** en el Escritorio y en el menú Inicio.
4. Abrir desde ese acceso directo y loguearse.

> En esta entrega no hay `.exe` autodescomprimible: usar el zip + `Instalar.cmd`.

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

## Cómo actualizar / reinstalar

- **Android:** instalar el APK nuevo encima del anterior; no se pierden datos
  (el login queda guardado). Si falla, desinstalar e instalar de nuevo.
- **Windows:** descomprimir el zip nuevo y ejecutar `Instalar.cmd` otra vez;
  pisa la versión anterior sin tocar nada más. Para desinstalar:
  `Desinstalar.cmd` dentro de `%LOCALAPPDATA%\Mostrador`, o borrar esa carpeta
  y los accesos directos.

## Recompilar apuntando a otra URL

```bat
cd clients/puesto_flutter
flutter build apk --release --dart-define=API_BASE_URL=http://IP:8080 --dart-define=API_AUTH_ORIGIN=http://IP:8080
flutter build windows --release --dart-define=API_BASE_URL=http://IP:8080 --dart-define=API_AUTH_ORIGIN=http://IP:8080
```

> El backend debe aceptar el origen: en `app/.env` fijar
> `BETTER_AUTH_URL=http://IP:8080` y reiniciar `npm run dev` (sin esto el
> login desde la LAN devuelve 403 "Invalid origin").

## Alcance y limitaciones conocidas (DEV)

- OCR de remitos: **no habilitado** en el servidor DEV (falta la clave del
  proveedor). El alta de remitos es manual; la foto/archivo avisa que la
  lectura no está disponible.
- Impresión: diálogo del sistema de Windows (PDF 80 mm). La impresora
  térmica directa queda pendiente de definir hardware.
- El vendedor necesita conexión (no hay modo offline todavía).
- Todo lo que se cargue/cobre es contra la base **DEV** (descartable).
