# MOSTRADOR --- MIGRATION.md

## 1. Propósito

Este documento es el contrato de migración del proyecto **Mostrador ---
ERP para Frutas Román, el Jujeño (Mercado Central)** desde su versión
web actual hacia una aplicación **Flutter multiplataforma para Android y
Windows**.

La migración debe preservar la lógica de negocio y el comportamiento
funcional existentes. No debe convertirse en un rediseño funcional
arbitrario.

### Objetivos de esta migración

-   Reutilizar la lógica de negocio existente como especificación
    funcional.
-   Llevar la aplicación operativa a Flutter.
-   Generar una aplicación Android para operación móvil.
-   Generar una aplicación Windows para mostrador/caja/administración.
-   Mantener el backend y el modelo de datos como contrato durante la
    primera migración.
-   Separar claramente funcionalidades obligatorias de funcionalidades
    opcionales.
-   Mantener ARCA como **add-on habilitable**, no como requisito para
    utilizar el ERP.

### Regla principal

> Primero comprender y documentar el sistema existente. Después migrar.
> No modificar la lógica de negocio simplemente para hacer más fácil la
> migración.

------------------------------------------------------------------------

## 2. Estado real del proyecto recibido

La versión analizada es una aplicación web construida con:

-   React 19
-   TypeScript
-   Vite
-   TanStack Start / TanStack Router
-   TanStack Query
-   Tailwind CSS 4
-   Radix UI
-   Zustand
-   Better Auth
-   PostgreSQL-compatible SQL
-   PGlite como fallback local
-   Neon como backend PostgreSQL cuando existe `DATABASE_URL`
-   Node/servidor para funciones server-side
-   integración directa con servicios de ARCA/AFIP
-   Playwright para pruebas

### IMPORTANTE: backend

El proyecto descargado **NO está usando Supabase actualmente**.

La abstracción existente en `src/lib/db.ts` utiliza:

-   **Neon/PostgreSQL** cuando existe `DATABASE_URL`.
-   **PGlite** como fallback local/preview.

La migración a Flutter **NO debe migrar automáticamente Neon/PGlite a
Supabase**.

Si posteriormente se decide utilizar Supabase para reducir costos de
infraestructura, esa debe ser una tarea independiente de migración de
backend.

### Regla para el agente

**NO reemplazar Neon/PGlite por Supabase durante esta migración salvo
instrucción explícita.**

------------------------------------------------------------------------

# 3. Arquitectura funcional actual

Mostrador no es solamente una pantalla de ventas.

Actualmente contiene estas áreas:

1.  Dashboard
2.  Vendedor
3.  Caja
4.  Productos
5.  Clientes
6.  Proveedores
7.  Remitos / ingreso de mercadería
8.  Cierre de caja
9.  Auditoría
10. Usuarios y roles
11. Portal de clientes
12. Mensajería pedido-cliente
13. Tickets / impresión térmica
14. Stock y movimientos
15. Cuenta corriente
16. ARCA / facturación electrónica
17. Notas de crédito
18. autenticación y recuperación de cuentas

------------------------------------------------------------------------

# 4. Roles actuales

El modelo de staff define:

``` text
admin
cajero
vendedor
```

Representación funcional:

  Rol        Descripción
  ---------- --------------------------------
  admin      Dueño / administración
  cajero     Caja y cobros
  vendedor   Carga y seguimiento de pedidos

También existe un **cliente externo** que utiliza el portal.

### Regla

No eliminar el modelo de permisos existente durante la migración.

La aplicación Flutter debe conservar:

-   autenticación;
-   identificación del usuario;
-   identificación del tenant;
-   rol;
-   permisos;
-   restricciones server-side.

Nunca confiar en un rol enviado solamente desde el cliente Flutter.

------------------------------------------------------------------------

# 5. Módulos existentes

## 5.1 Dashboard

Ruta actual:

``` text
/dashboard
```

Incluye:

-   actividad en vivo;
-   movimientos;
-   alertas;
-   pedidos en cola;
-   métricas;
-   gráficos;
-   filtros por día;
-   filtros por forma de pago;
-   filtros por producto;
-   resumen operativo.

El dashboard es principalmente una vista de administración.

------------------------------------------------------------------------

## 5.2 Vendedor

Ruta:

``` text
/vendedor
```

Funciones:

-   catálogo de productos;
-   búsqueda;
-   selección de cliente;
-   carrito;
-   cantidades;
-   notas;
-   creación de pedidos;
-   consulta de pedidos;
-   seguimiento de estados;
-   marcar entregado;
-   funcionamiento offline mediante cola local;
-   sincronización posterior.

Existe actualmente:

``` text
src/lib/offline-queue.ts
```

La migración Flutter debe conservar esta capacidad.

### Requisito importante

Android debe poder continuar capturando pedidos cuando la conectividad
sea intermitente.

La cola offline debe implementarse de manera robusta, preferentemente
con almacenamiento local estructurado y no simplemente con memoria.

------------------------------------------------------------------------

# 6. Caja

Ruta:

``` text
/caja
```

Funciones actuales:

-   bandeja de pedidos;
-   venta directa;
-   selección de pedido;
-   cobro;
-   efectivo;
-   transferencia;
-   tarjeta;
-   cuenta corriente;
-   cálculo de monto recibido;
-   cálculo de vuelto;
-   tickets;
-   últimos cobros;
-   anulación;
-   integración opcional con ARCA;
-   entrega de pedidos;
-   pedidos por entregar;
-   pedidos entregados.

### Windows

Este módulo es prioritario para Windows porque representa la operación
de mostrador/caja.

Debe contemplar:

-   teclado;
-   mouse;
-   pantallas grandes;
-   impresión;
-   operación rápida;
-   atajos cuando resulte conveniente.

### Android

No asumir que la interfaz Windows debe copiarse literalmente en Android.

La lógica debe ser compartida, pero la UI debe adaptarse al factor de
forma.

------------------------------------------------------------------------

# 7. Productos

Ruta:

``` text
/productos
```

Funciones:

-   listado;
-   búsqueda;
-   alta;
-   modificación;
-   activación/desactivación;
-   precio;
-   unidad;
-   etiqueta de unidad;
-   stock;
-   stock mínimo;
-   alias;
-   orden;
-   ajuste de stock;
-   merma.

Unidades actuales:

``` text
bulto
kg
```

No convertir unidades a un sistema distinto sin justificación.

------------------------------------------------------------------------

# 8. Stock

El stock tiene movimientos explícitos.

Tipos existentes:

``` text
entrada_remito
venta
anulacion_venta
ajuste
merma
reserva
liberacion
```

Existe además:

-   reserva de stock;
-   liberación de reserva;
-   alertas por stock bajo;
-   movimientos asociados a usuario;
-   referencia al origen del movimiento.

### Regla

El stock no debe modificarse arbitrariamente desde el cliente.

Las operaciones críticas deben continuar validándose en backend.

------------------------------------------------------------------------

# 9. Clientes

El proyecto YA contiene un módulo de clientes.

Ruta:

``` text
/clientes
```

Actualmente contempla:

-   nombre;
-   teléfono;
-   email;
-   CUIT/DNI;
-   dirección;
-   condición frente al IVA;
-   cuenta corriente;
-   saldo;
-   activo/inactivo;
-   movimientos de cuenta;
-   registro de pagos.

También existe relación entre cliente y usuario externo mediante:

``` text
clientes.user_id
```

### Decisión de producto pendiente

El usuario puede decidir si el módulo de clientes se incluye
completamente en la primera versión Flutter o se termina de implementar
posteriormente.

Por lo tanto:

**La arquitectura Flutter debe contemplarlo desde el principio, aunque
pueda permanecer oculto/deshabilitado en una primera release.**

No eliminarlo del modelo de dominio.

------------------------------------------------------------------------

# 10. Portal de clientes

Ruta:

``` text
/portal
```

El cliente puede:

-   consultar catálogo;
-   realizar pedidos;
-   consultar pedidos;
-   consultar cuenta;
-   consultar movimientos;
-   editar su ficha;
-   comunicarse sobre pedidos.

Existe además:

``` text
/registro
/recuperar
```

### Portal

Debe considerarse un módulo separado del backoffice.

En Flutter puede terminar siendo:

-   parte de la misma aplicación con navegación según rol; o
-   una aplicación Flutter independiente en el futuro.

Para esta migración se recomienda conservar una arquitectura de dominio
que permita ambas posibilidades.

------------------------------------------------------------------------

# 11. Mensajería

Existe mensajería asociada al pedido:

``` text
pedido_mensajes
```

Funciones:

-   mensajes del pedido;
-   envío de mensajes;
-   conversaciones del negocio;
-   mensajes pendientes del cliente;
-   actualización en vivo.

Archivos relevantes:

``` text
src/components/pedido-chat.tsx
src/lib/mensajes-fn.ts
src/lib/mensajes-en-vivo.ts
src/lib/server/mensajes-vivo.ts
src/lib/server/mensajes-socket.ts
```

La migración debe conservar el concepto de conversación vinculada al
pedido.

No reemplazar automáticamente por un chat genérico.

------------------------------------------------------------------------

# 12. Proveedores

Ruta:

``` text
/proveedores
```

Funciones:

-   alta;
-   edición;
-   baja lógica;
-   CUIT;
-   teléfono;
-   email;
-   dirección;
-   observaciones;
-   productos relacionados;
-   asociación con remitos.

------------------------------------------------------------------------

# 13. Remitos / ingreso de mercadería

Rutas:

``` text
/remitos
/remitos/:id
```

Funciones:

-   carga manual de remito;
-   proveedor;
-   líneas;
-   cantidad;
-   reconocimiento/matching;
-   asociación con producto;
-   nivel de confianza del match;
-   confirmación;
-   ingreso al stock.

Existe además:

``` text
parseRemitoVision
```

por lo que el sistema contempla procesamiento de remitos mediante
visión.

### Regla

El reconocimiento automático NO debe modificar stock directamente.

Debe existir un flujo:

``` text
Remito
   ↓
Extracción
   ↓
Matching
   ↓
Revisión humana
   ↓
Confirmación
   ↓
Movimiento de stock
```

------------------------------------------------------------------------

# 14. Cuenta corriente

La cuenta corriente utiliza:

``` text
cuenta_movimientos
```

Funciones actuales:

-   saldo;
-   movimientos;
-   cargos;
-   pagos;
-   referencia;
-   nota;
-   asociación con cliente.

No convertir saldo en un campo mutable sin historial.

El historial de movimientos es parte del modelo contable-operativo.

------------------------------------------------------------------------

# 15. Cierre de caja

Ruta:

``` text
/cierre
```

El sistema registra:

-   apertura;
-   cierre;
-   esperado;
-   real;
-   diferencia;
-   totales;
-   notas;
-   usuario responsable.

La lógica debe permanecer server-side.

------------------------------------------------------------------------

# 16. Auditoría

Ruta:

``` text
/auditoria
```

Existe una tabla:

``` text
auditoria
```

Registra:

-   usuario;
-   nombre;
-   acción;
-   entidad;
-   detalle;
-   fecha.

No eliminar este módulo durante la migración.

La auditoría es especialmente importante para:

-   cobros;
-   anulaciones;
-   cambios de stock;
-   modificaciones de clientes;
-   operaciones fiscales;
-   cierres de caja.

------------------------------------------------------------------------

# 17. Usuarios

Ruta:

``` text
/usuarios
```

Funciones:

-   alta de usuario;
-   nombre;
-   email;
-   contraseña;
-   rol;
-   activación/desactivación.

Roles:

``` text
admin
cajero
vendedor
```

------------------------------------------------------------------------

# 18. Tickets e impresión

Ruta:

``` text
/ticket/:cobroId
```

Existe:

``` text
src/components/ticket-slip.tsx
src/components/termica-boton.tsx
src/lib/termica.ts
```

Funciones:

-   visualización de ticket;
-   impresión;
-   impresión térmica;
-   fallback mediante impresión del sistema.

### Windows

La impresión térmica debe considerarse una integración de plataforma.

No asumir que el mecanismo web actual funcionará igual en Flutter
Desktop.

La migración debe crear una abstracción:

``` text
PrinterService
```

con una implementación Windows.

### Android

No asumir que Android tendrá impresora térmica directamente.

Debe existir una estrategia separada para:

-   Bluetooth;
-   red;
-   impresión compartida;
-   o generación de ticket.

No inventar una implementación hasta conocer el hardware real.

------------------------------------------------------------------------

# 19. ARCA / AFIP

## Estado

ARCA fue agregado como **add-on**.

La interfaz permite:

-   configurar datos fiscales;
-   cargar certificado;
-   cargar clave;
-   elegir homologación/producción;
-   probar conexión;
-   habilitar;
-   inhabilitar;
-   emitir factura;
-   emitir nota de crédito;
-   consultar comprobantes;
-   visualizar CAE.

La tabla correspondiente es:

``` text
afip_config
```

y las facturas:

``` text
facturas
```

### Concepto fundamental

ARCA está diseñado para permanecer **inhabilitado por defecto**.

El sistema debe poder operar como ERP aunque ARCA no esté configurado.

La UI debe comunicar claramente:

``` text
ARCA Inhabilitado
```

o

``` text
ARCA Habilitado
```

### No hacer

No convertir ARCA en requisito para:

-   vender;
-   cobrar;
-   gestionar stock;
-   gestionar clientes;
-   utilizar caja.

------------------------------------------------------------------------

# 20. Integración ARCA: seguridad

Actualmente los certificados y claves se manejan del lado servidor.

Esto es correcto conceptualmente.

### Regla crítica para Flutter

**Nunca colocar certificados, claves privadas, credenciales WSAA o
secretos ARCA dentro de la aplicación Flutter.**

Flutter solamente debe invocar las operaciones protegidas del backend.

Arquitectura deseada:

``` text
Flutter
   │
   │ solicitud autenticada
   ▼
Backend
   │
   ├── credenciales ARCA
   ├── certificado
   ├── clave privada
   ├── WSAA
   └── WSFE
          │
          ▼
        ARCA
```

------------------------------------------------------------------------

# 21. Modelo de datos

El proyecto contiene actualmente:

``` text
tenants
staff
productos
clientes
pedidos
pedido_items
cobros
tickets
ticket_seq
stock_movimientos
remitos
remito_items
alertas
auditoria
cierres_caja
proveedores
cuenta_movimientos
afip_config
facturas
pedido_mensajes
```

Además existe el esquema de autenticación de Better Auth:

``` text
user
session
account
verification
```

### Migraciones actuales

``` text
0001_auth.sql
0002_mostrador.sql
0003_producto_orden.sql
0004_cobro_anulado.sql
0005_clientes_proveedores.sql
0006_afip.sql
0006_pedido_mensajes.sql
0007_arca_habilitada.sql
```

No modificar el modelo de datos solamente para adecuarlo a Flutter.

Flutter debe consumir el dominio existente.

------------------------------------------------------------------------

# 22. Identificadores y sincronización

El proyecto utiliza identificadores propios mediante:

``` text
src/lib/ids.ts
```

Los pedidos poseen:

``` text
client_uuid
```

para evitar duplicados en operaciones repetidas/offline.

Este concepto debe mantenerse.

### Requisito

Una operación enviada dos veces por una reconexión no debe generar:

-   dos pedidos;
-   dos cobros;
-   dos facturas.

La idempotencia debe preservarse.

------------------------------------------------------------------------

# 23. Estados de pedido

Estados existentes:

``` text
borrador
enviado
en_preparacion
listo
cobrado
anulado
entregado
```

No reemplazar estos estados sin documentar explícitamente la
equivalencia.

La UI Flutter puede presentar etiquetas distintas, pero el dominio debe
mantener estados inequívocos.

------------------------------------------------------------------------

# 24. Formas de pago

Actualmente:

``` text
efectivo
transferencia
tarjeta
cuenta_corriente
```

El sistema contempla:

-   monto;
-   monto recibido;
-   vuelto;
-   usuario;
-   fecha;
-   relación con pedido.

------------------------------------------------------------------------

# 25. Arquitectura Flutter objetivo

Se recomienda una estructura aproximadamente:

``` text
lib/
  core/
    auth/
    config/
    errors/
    network/
    storage/
    synchronization/
    printing/

  domain/
    entities/
    enums/
    repositories/
    services/

  data/
    models/
    datasources/
    repositories/

  features/
    dashboard/
    vendedor/
    caja/
    productos/
    clientes/
    proveedores/
    remitos/
    cuenta_corriente/
    cierre/
    auditoria/
    usuarios/
    portal/
    arca/
    tickets/

  app/
    router/
    theme/
    widgets/
```

La estructura exacta puede variar, pero debe conservar separación entre:

``` text
UI
↓
Estado / casos de uso
↓
Dominio
↓
Repositorios
↓
API / backend
```

No colocar SQL ni secretos dentro de widgets.

------------------------------------------------------------------------

# 26. Estado y manejo de datos

La implementación actual usa TanStack Query.

En Flutter se puede utilizar una estrategia equivalente, por ejemplo:

-   Riverpod;
-   o una arquitectura equivalente bien justificada.

La elección debe priorizar:

-   cache;
-   invalidación;
-   estados loading/error/success;
-   sincronización;
-   offline;
-   consistencia.

No convertir todas las consultas en estado global permanente.

------------------------------------------------------------------------

# 27. Navegación por rol

La navegación debe depender del rol autenticado.

Ejemplo conceptual:

``` text
ADMIN
 ├── Dashboard
 ├── Caja
 ├── Productos
 ├── Clientes
 ├── Proveedores
 ├── Remitos
 ├── Cierre
 ├── Auditoría
 ├── Usuarios
 └── ARCA

CAJERO
 ├── Caja
 ├── Pedidos
 ├── Clientes
 └── Cierre

VENDEDOR
 ├── Vendedor
 ├── Pedidos
 └── Clientes
```

El servidor continúa siendo la autoridad para autorización.

------------------------------------------------------------------------

# 28. Diferencias Android / Windows

## Windows

Prioridades:

-   caja;
-   mostrador;
-   dashboard;
-   productos;
-   remitos;
-   clientes;
-   proveedores;
-   administración;
-   impresión;
-   teclado/mouse;
-   ventanas amplias.

## Android

Prioridades:

-   vendedor;
-   pedidos;
-   catálogo;
-   clientes;
-   seguimiento;
-   consulta;
-   operación offline;
-   cámara si posteriormente se utiliza para documentos.

### Regla

Compartir:

-   modelos;
-   dominio;
-   servicios;
-   API;
-   reglas de negocio.

Adaptar:

-   navegación;
-   layout;
-   interacción;
-   controles;
-   impresión;
-   almacenamiento local.

------------------------------------------------------------------------

# 29. Cliente como módulo opcional

El sistema actual ya posee clientes y portal.

Sin embargo, para una primera release Flutter se puede utilizar una
bandera conceptual:

``` text
CLIENTES_ENABLED
```

o una configuración equivalente.

### Si se decide postergar clientes

No borrar:

-   entidades;
-   tablas;
-   repositorios;
-   APIs;
-   modelos.

Simplemente:

-   ocultar navegación;
-   deshabilitar portal;
-   evitar exponer funcionalidades incompletas.

Esto permitirá activar el módulo posteriormente sin rehacer
arquitectura.

------------------------------------------------------------------------

# 30. ARCA como add-on

La misma estrategia debe aplicarse a ARCA.

Estado inicial:

``` text
ARCA_ENABLED = false
```

Pero el código de dominio debe estar preparado.

La activación debe ser:

``` text
configuración válida
+
credenciales válidas
+
certificado
+
clave
+
habilitación explícita
```

No activar automáticamente producción.

------------------------------------------------------------------------

# 31. Lo que NO debe hacer Gemini/AntiGravity

Durante esta migración, el agente NO debe:

1.  Cambiar Neon por Supabase sin autorización.
2.  Cambiar PostgreSQL por otro motor.
3.  Eliminar tablas porque parecen innecesarias.
4.  Eliminar clientes porque todavía se está evaluando su release.
5.  Eliminar ARCA porque está deshabilitado.
6.  Mover certificados ARCA al cliente Flutter.
7.  Poner secretos en `dart-define` como sustituto de un backend seguro.
8.  Reescribir las reglas de stock.
9.  Eliminar la idempotencia de pedidos/cobros.
10. Eliminar la auditoría.
11. Convertir operaciones críticas en lógica exclusivamente cliente.
12. Crear datos ficticios para reemplazar datos reales.
13. Cambiar estados de pedido sin documentar equivalencias.
14. Cambiar unidades de producto.
15. Alterar cálculos fiscales sin pruebas.
16. Hacer que ARCA sea obligatorio.
17. Crear una segunda base de datos innecesaria.
18. Reemplazar la arquitectura completa antes de comprenderla.

------------------------------------------------------------------------

# 32. Orden recomendado de migración

## Fase 1 --- análisis

Gemini debe:

-   leer todo el proyecto;
-   identificar rutas;
-   identificar funciones server-side;
-   identificar tablas;
-   identificar modelos;
-   identificar dependencias;
-   generar mapa de funcionalidades;
-   identificar puntos críticos.

No escribir código todavía.

## Fase 2 --- contrato

Crear:

``` text
domain/
data/
core/
features/
```

y definir:

-   entidades;
-   enums;
-   interfaces;
-   repositorios;
-   cliente API;
-   autenticación;
-   manejo de errores.

## Fase 3 --- autenticación

Migrar:

-   login;
-   sesión;
-   identificación de usuario;
-   rol;
-   tenant;
-   logout.

## Fase 4 --- catálogo y stock

Migrar:

-   productos;
-   búsqueda;
-   stock;
-   ajustes;
-   alertas.

## Fase 5 --- vendedor

Migrar:

-   carrito;
-   cliente;
-   pedido;
-   estados;
-   offline;
-   sincronización.

## Fase 6 --- caja

Migrar:

-   bandeja;
-   cobro;
-   medios de pago;
-   vuelto;
-   anulación;
-   tickets.

## Fase 7 --- administración

Migrar:

-   dashboard;
-   clientes;
-   proveedores;
-   remitos;
-   cuenta corriente;
-   cierre;
-   auditoría;
-   usuarios.

## Fase 8 --- portal

Migrar:

-   catálogo cliente;
-   pedidos;
-   cuenta;
-   mensajes.

## Fase 9 --- ARCA

Migrar como módulo aislado:

-   configuración;
-   homologación;
-   producción;
-   emisión;
-   CAE;
-   nota de crédito;
-   consulta.

## Fase 10 --- impresión

Implementar:

-   ticket;
-   Windows printer;
-   thermal printer abstraction.

## Fase 11 --- QA

Probar cada flujo antes de declarar terminada la migración.

------------------------------------------------------------------------

# 33. Criterios de aceptación

La migración se considera funcional cuando:

### Autenticación

-   cada usuario entra con sus credenciales;
-   el rol es correcto;
-   el servidor valida permisos.

### Productos

-   crear;
-   editar;
-   desactivar;
-   buscar;
-   modificar precio;
-   ajustar stock.

### Pedidos

-   crear;
-   modificar;
-   enviar;
-   preparar;
-   marcar listo;
-   cobrar;
-   entregar;
-   anular.

### Offline

-   crear pedido sin conexión;
-   conservarlo localmente;
-   reconectar;
-   sincronizar;
-   evitar duplicados.

### Caja

-   efectivo;
-   transferencia;
-   tarjeta;
-   cuenta corriente;
-   vuelto;
-   ticket;
-   anulación.

### Stock

-   venta descuenta;
-   remito incrementa;
-   anulación revierte;
-   reserva funciona;
-   liberación funciona;
-   alertas funcionan.

### Clientes

-   alta;
-   edición;
-   cuenta corriente;
-   saldo;
-   movimientos.

### Remitos

-   creación;
-   matching;
-   revisión;
-   confirmación;
-   ingreso de stock.

### Auditoría

Las operaciones críticas quedan registradas.

### ARCA

Con ARCA deshabilitado:

-   el ERP funciona normalmente.

Con ARCA habilitado:

-   configuración;
-   conexión;
-   emisión;
-   CAE;
-   nota de crédito.

------------------------------------------------------------------------

# 34. Pruebas de regresión obligatorias

Antes de considerar terminada la migración:

``` text
Crear producto
↓
Ajustar stock
↓
Crear pedido
↓
Reservar stock
↓
Cobrar
↓
Generar ticket
↓
Descontar stock
↓
Registrar auditoría
```

Segundo flujo:

``` text
Crear remito
↓
Asignar proveedor
↓
Relacionar productos
↓
Confirmar
↓
Incrementar stock
```

Tercer flujo:

``` text
Cliente
↓
Pedido
↓
Vendedor
↓
Caja
↓
Cobro
↓
Entrega
```

Cuarto flujo:

``` text
Cliente con cuenta corriente
↓
Pedido
↓
Cobro a cuenta
↓
Movimiento de cuenta
↓
Pago posterior
↓
Actualización de saldo
```

Quinto flujo:

``` text
ARCA deshabilitado
↓
Venta
↓
Cobro
↓
ERP funciona normalmente
```

Sexto flujo:

``` text
ARCA habilitado
↓
Cobro
↓
Solicitud de CAE
↓
Factura
↓
Ticket/comprobante
```

------------------------------------------------------------------------

# 35. Principio de migración

La aplicación web actual es la **fuente funcional de referencia**.

Flutter es la nueva implementación de esa funcionalidad.

Por lo tanto:

``` text
WEB ACTUAL
   ↓
ESPECIFICACIÓN FUNCIONAL
   ↓
DOMINIO FLUTTER
   ↓
ANDROID + WINDOWS
```

No:

``` text
WEB ACTUAL
   ↓
"REDISEÑO COMPLETO"
   ↓
FUNCIONALIDAD DIFERENTE
```

------------------------------------------------------------------------

# 36. Estrategia de releases

## Release 1

ERP operativo:

-   autenticación;
-   productos;
-   stock;
-   vendedor;
-   pedidos;
-   caja;
-   tickets;
-   dashboard;
-   usuarios;
-   cierre.

## Release 1.x

Administración ampliada:

-   clientes;
-   proveedores;
-   remitos;
-   cuenta corriente;
-   auditoría;
-   portal.

## Add-on

ARCA:

-   homologación;
-   producción;
-   factura electrónica;
-   nota de crédito.

### Nota

La separación anterior es de release, no de arquitectura.

El dominio debe estar preparado desde el comienzo para todas estas
funcionalidades.

------------------------------------------------------------------------

# 37. Información específica para el agente

El nombre funcional del producto es:

**Mostrador**

Negocio inicial:

**Frutas Román, el Jujeño --- Mercado Central**

El sistema es un ERP operativo para un puesto mayorista de frutas y
verduras.

El objetivo no es construir un ERP genérico para cualquier comercio.

Las decisiones de dominio deben respetar el contexto:

-   ventas mayoristas;
-   productos por kg/bulto;
-   pedidos;
-   vendedores;
-   caja;
-   stock;
-   proveedores;
-   remitos;
-   clientes;
-   cuenta corriente;
-   entrega;
-   facturación electrónica.

No generalizar prematuramente.

------------------------------------------------------------------------

# 38. Checklist final para Gemini

Antes de escribir código:

-   [ ] Leí todo el proyecto.
-   [ ] Identifiqué todas las rutas.
-   [ ] Identifiqué todas las tablas.
-   [ ] Identifiqué todas las funciones server-side.
-   [ ] Identifiqué autenticación.
-   [ ] Identifiqué roles.
-   [ ] Identifiqué operaciones críticas.
-   [ ] Identifiqué offline.
-   [ ] Identifiqué impresión.
-   [ ] Identifiqué ARCA.
-   [ ] Identifiqué clientes y portal.
-   [ ] Identifiqué mensajería.
-   [ ] Identifiqué el backend real.
-   [ ] No asumí que el backend es Supabase.

Antes de entregar:

-   [ ] Android compila.
-   [ ] Windows compila.
-   [ ] Login funciona.
-   [ ] Roles funcionan.
-   [ ] Productos funcionan.
-   [ ] Stock funciona.
-   [ ] Pedidos funcionan.
-   [ ] Offline funciona.
-   [ ] Caja funciona.
-   [ ] Tickets funcionan.
-   [ ] Clientes funcionan si están habilitados.
-   [ ] Remitos funcionan.
-   [ ] Cierre funciona.
-   [ ] Auditoría funciona.
-   [ ] ARCA permanece opcional.
-   [ ] No existen secretos dentro de Flutter.
-   [ ] No se rompió la idempotencia.
-   [ ] No se alteraron reglas fiscales.
-   [ ] No se modificó el backend sin autorización.

------------------------------------------------------------------------

# 39. Instrucción final

**Migrar el sistema existente a Flutter para Android y Windows
preservando funcionalidad, reglas de negocio, modelo de datos, seguridad
e idempotencia.**

Primero analizar.

Después diseñar.

Después migrar por módulos.

No realizar una reescritura funcional arbitraria.

No cambiar infraestructura.

No eliminar funcionalidades existentes.

No introducir dependencias innecesarias.

Cuando exista una decisión de producto pendiente ---especialmente
clientes/portal y ARCA--- mantener la arquitectura preparada y permitir
su activación posterior sin rehacer el núcleo.

**La prioridad es obtener una versión Flutter operativa y equivalente al
sistema actual, no una versión conceptualmente distinta.**
