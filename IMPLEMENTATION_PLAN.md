# Plan de implementación — Migración de Mostrador a Flutter

## Objetivo y límites

Construir clientes Flutter para **Android** y **Windows** que repliquen la
operación del ERP web existente, sin rediseñar las reglas de negocio. El
backend actual (Node/TanStack Start, Better Auth y PostgreSQL/Neon, con
PGlite sólo como fallback local) y sus migraciones SQL permanecen como la
fuente de verdad en esta migración.

No se migrará a Supabase, no se creará una segunda base de datos y la app
Flutter no tendrá acceso SQL ni secretos de ARCA.

## Hallazgos que condicionan la implementación

- El dominio actual está concentrado principalmente en `src/lib/fn.ts`,
  `src/lib/portal-fn.ts`, `src/lib/afip-fn.ts` y los servicios server-side de
  stock, mensajería y ARCA.
- Esas funciones son RPC internas de TanStack Start; no constituyen todavía
  un contrato HTTP para una app Flutter. Antes de construir pantallas se debe
  publicar una API autenticada que delegue en la misma lógica de negocio.
- Las operaciones críticas ya tienen invariantes que deben conservarse:
  tenant y rol del servidor, stock por movimientos, auditoría, estados de
  pedido, cuentas corrientes, y unicidad por `(tenant_id, client_uuid)` para
  pedidos y cobros.
- La cola web actual usa `localStorage`; Android requiere una outbox
  persistente y transaccional.
- La impresión web se apoya en Web Bluetooth/WebUSB. Windows y Android
  requieren implementaciones de plataforma separadas detrás de una misma
  abstracción.

## Decisiones de arquitectura

1. Crear un monorepo o un directorio `flutter/` separado del frontend web,
   manteniendo el backend y las migraciones actuales sin cambios de motor.
2. Crear una API versionada (`/api/v1`) en el servidor existente. Cada
   endpoint autenticará la sesión/token, determinará usuario, tenant y rol en
   el servidor, y llamará a casos de uso compartidos. No duplicará SQL en los
   controladores ni en Flutter.
3. Extraer gradualmente los casos de uso de las funciones TanStack hacia
   servicios de dominio reutilizables por la web y por la API. Esto reduce la
   posibilidad de divergencia durante una transición coexistente.
4. Estructurar Flutter en `core`, `domain`, `data`, `features` y `app`.
   Usar un gestor de estado con cache e invalidación (por ejemplo Riverpod),
   repositorios para la API y almacenamiento local estructurado para la
   outbox/cache.
5. Usar las mismas enumeraciones y valores persistidos: roles `admin`,
   `cajero`, `vendedor`; unidades `bulto`, `kg`; siete estados de pedido;
   cuatro medios de pago; y siete tipos de movimiento de stock.
6. Aplicar feature flags de presentación, inicialmente `CLIENTES_ENABLED` y
   `ARCA_ENABLED`. Ocultan rutas incompletas, pero no eliminan entidades,
   endpoints ni reglas de dominio.

## Fases y entregables

### 0. Inventario y contrato verificable

- Documentar el mapa endpoint/caso de uso/rol/tablas para todas las funciones
  exportadas por `fn.ts`, `portal-fn.ts`, `afip-fn.ts` y `mensajes-fn.ts`.
- Convertir los tipos TypeScript actuales en un contrato versionado (OpenAPI o
  equivalente), incluyendo formatos de error, importes decimales, fechas e
  idempotency keys.
- Confirmar en ambiente real el método de autenticación móvil compatible con
  Better Auth (login, renovación, cierre de sesión y revocación), antes de
  implementar persistencia de credenciales.
- Añadir pruebas de caracterización al backend para cobro, anulación, reserva,
  remito, cuenta corriente, cierre, auditoría y ARCA.

**Salida:** contrato API aprobado y suite de regresión del backend que capture
el comportamiento web actual.

### 1. API móvil y seguridad

- Implementar endpoints de sesión, identidad actual, catálogo y operaciones
  de dominio; comenzar por los flujos de Release 1.
- Centralizar autorización por tenant y rol en middleware/casos de uso del
  servidor. El cliente sólo adapta la navegación, nunca autoriza operaciones.
- Mantener las garantías de idempotencia: `client_uuid` estable generado antes
  de encolar; claves distintas para pedido, cobro y emisión fiscal cuando
  corresponda.
- Registrar auditoría desde el servidor para cada operación crítica.
- Mantener certificados, claves y WSAA/WSFE de ARCA exclusivamente server-side.

**Salida:** API consumible por Flutter, con pruebas de permisos, tenant
isolation, reintentos e idempotencia.

### 2. Fundaciones Flutter

- Inicializar proyectos Android y Windows, configuración por ambiente y CI de
  compilación para ambas plataformas.
- Implementar cliente HTTP, interceptores de autenticación, serialización de
  errores, logging sin datos sensibles, sesión segura y cierre de sesión.
- Crear entidades, enums, DTOs, repositorios y casos de uso del dominio.
- Implementar router según identidad/rol y dos shells adaptativos: navegación
  compacta para Android y lateral/teclado para Windows.
- Definir diseño visual compartido y componentes accesibles; adaptar layout,
  no las reglas de negocio.

**Salida:** login/logout, recuperación según el contrato confirmado, identidad
actual, navegación por rol y catálogo de sólo lectura en Android y Windows.

### 3. Catálogo, stock y vendedor (prioridad Android)

- Migrar listado, búsqueda por nombre/alias, alta/edición/desactivación de
  productos para los roles permitidos.
- Exponer stock, alertas, ajuste y merma mediante operaciones server-side; el
  dispositivo no calcula ni actualiza stock de forma autónoma.
- Implementar carrito, selección/alta rápida de cliente si está habilitada,
  notas, creación de pedido, consulta y entrega según las transiciones
  vigentes.
- Reemplazar `localStorage` por una outbox local estructurada: payload,
  `clientUuid`, fecha, estado, contador de reintentos y último error. Sincronizar
  al iniciar, al recuperar red y manualmente; borrar sólo tras confirmación.
- Mostrar conflictos y pedidos pendientes al usuario sin recrear pedidos.

**Salida:** un vendedor puede cargar un pedido sin conexión, reiniciar la app,
reconectar y sincronizar exactamente una vez.

### 4. Caja y tickets (prioridad Windows)

- Migrar bandeja, venta directa, edición autorizada de pedido, medios de pago,
  monto recibido, vuelto, entrega, últimos cobros y anulaciones.
- Mantener secuencia: validar pedido/reserva, cobrar, registrar movimiento de
  stock, generar ticket, auditar; la transacción y sus validaciones viven en
  backend.
- Diseñar la interfaz Windows para operación rápida con mouse, teclado,
  foco predecible y atajos documentados. Ofrecer una variante móvil compacta.
- Definir `PrinterService` con contrato común (vista/PDF/fallback de sistema),
  adaptador Windows y adaptadores Android sólo después de identificar hardware
  (Bluetooth, red o impresión compartida).

**Salida:** cobros reproducibles con efectivo, transferencia, tarjeta y cuenta
corriente; ticket visible e impresión por fallback del sistema.

### 5. Administración y Release 1

- Migrar dashboard, alertas, usuarios, roles, apertura/cierre de caja y vistas
  de productos/stock necesarias para administrar la operación.
- Conservar métricas y filtros como consultas al backend; no replicar cálculos
  contables en Flutter.
- Incorporar monitoreo de errores, métricas de sincronización y trazabilidad
  de requests por idempotency key.

**Salida (Release 1):** autenticación, productos/stock, vendedor/pedidos
offline, caja/tickets, dashboard, usuarios y cierre disponibles en Android y/o
Windows según prioridad de cada módulo.

### 6. Administración ampliada (Release 1.x)

- Activar o completar clientes, proveedores, remitos, cuenta corriente,
  auditoría, portal y mensajería de pedido.
- Para remitos, conservar el flujo obligatorio: extracción/matching → revisión
  humana → confirmación → movimiento `entrada_remito`. La visión nunca altera
  stock directamente.
- Para cuentas corrientes, derivar saldo desde `cuenta_movimientos`, preservando
  cargos, pagos, referencia y nota.
- Para mensajes, consumir un canal autenticado de actualizaciones en vivo con
  reconexión y fallback de refresco, manteniendo la asociación pedido-cliente.

**Salida:** módulos administrativos completos, activables sin alterar el
modelo de datos.

### 7. ARCA como add-on

- Migrar solamente la interfaz y las llamadas autenticadas de configuración,
  diagnóstico, emisión, consulta, CAE y notas de crédito.
- El estado inicial es inhabilitado. Venta, cobro, stock y caja deben seguir
  funcionando sin configuración fiscal.
- Probar primero homologación; habilitar producción sólo con configuración
  válida y acción explícita de un administrador.

**Salida:** add-on aislado, sin secretos en Flutter y con emisión idempotente.

## Matriz mínima de pruebas de aceptación

| Flujo | Comprobación obligatoria |
| --- | --- |
| Permisos | Un rol sin autorización recibe rechazo del servidor aunque fuerce la UI. |
| Pedido offline | Reintentos y reinicio no duplican el pedido por `client_uuid`. |
| Venta | Reserva/venta/anulación/liberación producen movimientos y stock correctos. |
| Caja | Los cuatro medios de pago, vuelto, ticket y auditoría coinciden con backend. |
| Remito | Sólo la confirmación humana incrementa stock. |
| Cuenta corriente | Cargo y pago conservan historial y saldo correcto. |
| ARCA apagado | El ERP opera completo sin credenciales fiscales. |
| ARCA encendido | Emisión, CAE y nota de crédito no se duplican al reintentar. |
| Plataformas | Android y Windows compilan; los flujos asignados se prueban en dispositivos reales. |

## Riesgos y validaciones previas

1. Definir y probar autenticación móvil antes de fijar la API; no almacenar
   contraseñas ni secretos como alternativa.
2. Validar impresoras reales antes de comprometer una vía térmica específica.
3. Tratar importes y cantidades como decimales definidos por el contrato para
   evitar errores de punto flotante entre Dart y PostgreSQL.
4. Desplegar API y clientes en paralelo con la web existente; ejecutar los
   flujos de regresión contra la misma base/entorno controlado antes de cada
   activación.
5. No alterar ni reordenar las migraciones existentes. Cualquier evolución de
   esquema futura será una migración nueva, revisada y compatible.
