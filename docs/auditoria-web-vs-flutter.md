# Auditoría comparativa: Mostrador Web vs. Flutter

**Fecha:** 2026-10-21
**Alcance:** Versión web ("version full") vs. cliente Flutter (`clients/puesto_flutter/`)
**Objetivo:** Identificar con precisión qué falta trasladar a Flutter para alcanzar paridad funcional en Windows y Android.

---

## 1. Resumen ejecutivo

La versión web y el cliente Flutter comparten el mismo backend (`/api/v1/`) y el mismo sistema de autenticación (Better Auth). El alcance de esta auditoría se limita a **"El Puesto"** — la aplicación de staff (AppShell en la web, adaptive shell en Flutter) — excluyendo Torre de Control, Mercado al Toque y Portal del Cliente, que son aplicaciones independientes.

**Paridad actual estimada: ~65% de las funciones del Puesto.**

Flutter cubre correctamente el ciclo operativo básico (catálogo, pedidos, cobro, cierre de caja, productos, clientes, proveedores, remitos, usuarios, auditoría, reportes, alertas, suscripción). Le faltan módulos completos de gestión (egresos, costos/márgenes, identidad del negocio, chat de pedidos, cola offline, escritorio del dueño, stock visual, sucursales, canal Mercado, marketing/add-ons) y operaciones sueltas en módulos existentes (cambiar clave, historial en producto, calificar comprador).

---

## 2. Inventario de módulos

### 2.1 Web (AppShell — "El Puesto")

| Módulo | Ruta | Roles |
|--------|------|-------|
| Dashboard/Tablero | `/dashboard` | admin |
| Escritorio del dueño | `/escritorio` | admin |
| Caja | `/caja` | admin, cajero |
| Puesto (vendedor) | `/vendedor` | admin, vendedor |
| Productos | `/productos` | admin |
| Proveedores | `/proveedores` | admin |
| Clientes | `/clientes` | admin |
| Clientes de la app | `/clientes-app` | admin |
| Remitos | `/remitos`, `/remitos/$id` | admin, cajero |
| Add-ons | `/addons` | admin |
| Usuarios | `/usuarios` | admin |
| Contrato | `/contrato` | admin |
| Marketing | `/marketing` | admin |
| Auditoría | `/auditoria` | admin |
| Cierre de caja | `/cierre` | admin, cajero |
| ARCA | `/arca` | admin, cajero |
| Ticket | `/ticket/$cobroId` | todos |
| Factura | `/factura/$id` | admin, cajero |

### 2.2 Flutter (adaptive shell)

| Módulo | Ruta | Roles |
|--------|------|-------|
| Dashboard | `/admin` → tab "Tablero" | admin |
| Catálogo | `/admin`, `/caja`, `/vendedor` → tab "Catálogo" | todos |
| Productos | `/admin` → tab "Productos" | admin |
| Alertas | `/admin` → tab "Alertas" | admin |
| Usuarios | `/admin` → tab "Usuarios" | admin |
| Clientes | `/admin` → tab "Clientes" | admin |
| Proveedores | `/admin` → tab "Proveedores" | admin |
| Remitos | `/admin` → tab "Remitos" | admin |
| Reportes | `/admin` → tab "Reportes" | admin |
| Auditoría | `/admin` → tab "Auditoría" | admin |
| Suscripción | `/admin` → tab "Suscripción" | admin |
| Carrito | `/vendedor` → tab "Carrito" | vendedor |
| Pedidos | `/vendedor` → tab "Pedidos" | vendedor |
| Caja | `/caja` → tab "Caja" | cajero |
| Sesión | todos los roles → tab "Sesión" | todos |

---

## 3. Tabla comparativa

### Leyenda de estados

- **COMPLETA**: existe y funciona en ambos lados.
- **PARCIAL**: existe en Flutter pero le faltan operaciones que la web sí tiene.
- **AUSENTE**: existe en la web y no hay implementación equivalente en Flutter.
- **DIFERENTE**: ambos la implementan con comportamiento distinto.
- **NO APLICA**: función de otra aplicación web (Torre/Mercado/Portal), fuera del alcance de Flutter.

### 3.1 Autenticación y sesión

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Login email/password | `src/routes/login.tsx` | `lib/features/auth/login_screen.dart` | COMPLETA | Ambos consumen `POST /api/auth/sign-in/email` | — |
| Logout | `src/lib/auth/gates.tsx` | `lib/core/auth/auth_controller.dart` | COMPLETA | Ambos consumen `POST /api/auth/sign-out` | — |
| Restaurar sesión | `src/lib/auth/server.ts` | `lib/core/auth/auth_controller.dart` `_bootstrap()` | COMPLETA | Flutter usa `FlutterSecureStorage` | — |
| Redirect por rol | `src/routes/index.tsx` | `lib/core/routing/app_router.dart` `_rutaInicial()` | COMPLETA | admin→dashboard, cajero→caja, vendedor→vendedor | — |
| Tema claro/oscuro | `src/components/tema-boton.tsx` | `lib/core/tema.dart` | COMPLETA | Ambos persisten preferencia | — |

### 3.2 Catálogo y productos

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Listar productos | `listProductos()` en `fn.ts` | `catalogo_service.dart` `listar()` | COMPLETA | Ambos consumen `GET /api/v1/catalogo` | — |
| Buscar por nombre/alias | `src/routes/vendedor.tsx` | `catalogo_screen.dart` | COMPLETA | Búsqueda local por nombre y alias | — |
| Crear producto | `saveProducto()` en `fn.ts` | `producto_form_controller.dart` `guardar()` | COMPLETA | `POST /api/v1/productos` | — |
| Editar producto | `saveProducto()` en `fn.ts` | `producto_form_controller.dart` `guardar()` | COMPLETA | Mismo endpoint | — |
| Dar de baja (lógico) | `saveProducto()` con `activo:false` | `producto_form_controller.dart` `bajar()` | COMPLETA | `POST /api/v1/productos/{id}/baja` | — |
| Ajuste de stock | `ajustarStock()` en `fn.ts` | `ajuste_stock_controller.dart` | COMPLETA | `POST /api/v1/stock/ajuste` (sumar/restar/merma) | — |
| Costo y margen por producto | `CostosMercaderia` en `costos-mercaderia.tsx` | — | AUSENTE | Web: `guardarCosto()`, `aplicarMargen()`, `tomarCostosRemito()` en `costos-fn.ts`. Flutter: sin referencia a costo/margen. | ALTA |
| Historial de ventas del producto | `historialProducto()` en `fn.ts`, panel en `productos.tsx` | `reportes_service.dart` `obtenerHistorialProducto()` | PARCIAL | Flutter lo tiene en Reportes; la web lo muestra también en la página de Productos. | BAJA |
| Canal Mercado (publicar/no publicar) | `canalMercado()`, `guardarCanalMercado()` en `fn.ts` | — | AUSENTE | Web: toggle por producto en `productos.tsx`. Flutter: sin referencia. | MEDIA |
| Stock Board (grilla visual drag-to-reorder) | `stock-board.tsx` | — | AUSENTE | Web: grilla con barras de color, drag-to-reorder, creación rápida. Flutter: solo lista en Productos. | MEDIA |

### 3.3 Caja y cobro

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Listar pedidos (por cobrar/cobrados/todos) | `src/routes/caja.tsx` | `caja_pane.dart` | COMPLETA | `GET /api/v1/pedidos` con filtro de estados | — |
| Cobrar pedido | `cobrarPedido()` en `fn.ts` | `cobro_controller.dart` | COMPLETA | `POST /api/v1/pedidos/{id}/cobrar` con idempotencia | — |
| Formas de pago (efectivo/transferencia/tarjeta/cuenta corriente) | `src/routes/caja.tsx` | `cobro_dialog.dart` | COMPLETA | 4 formas en ambos | — |
| Vuelto | `cobrarPedido()` retorna vuelto | `cobro_dialog.dart` | COMPLETA | Estimación local + confirmación del backend | — |
| Editar ítems del pedido | `updatePedidoItems()` en `fn.ts` | `edicion_items_controller.dart` | COMPLETA | `POST /api/v1/pedidos/{id}/items` | — |
| Anular pedido | `anularPedido()` en `fn.ts` | `anulaciones_service.dart` `pedido()` | COMPLETA | `POST /api/v1/pedidos/{id}/anular` | — |
| Anular cobro | `anularCobro()` en `fn.ts` | `anulaciones_service.dart` `cobro()` | COMPLETA | `POST /api/v1/cobros/{id}/anular` | — |
| Ver ticket | `getTicket()` en `fn.ts` | `pedidos_service.dart` `ticket()` | COMPLETA | `GET /api/v1/cobros/{id}/ticket` | — |
| Imprimir ticket (sistema) | `window.print()` fallback | `printer_service.dart` `imprimirTicket()` | COMPLETA | Flutter genera PDF 80mm con `pdf` package | — |
| Imprimir ticket (térmica Bluetooth) | `termica-boton.tsx` + Web Bluetooth API | — | AUSENTE | Web: emparejamiento USB/Bluetooth directo. Flutter: solo diálogo de impresión del sistema. | BAJA |
| Egresos del turno (gastos) | `CajaEgresos` en `caja-egresos.tsx` | — | AUSENTE | Web: categorías (alquiler, combustible, servicios, proveedores, mercadería, sueldos, otros), monto, forma de pago. Flutter: sin referencia a egresos. | ALTA |
| Estado de caja (totales por forma de pago) | `estadoCaja()` en `fn.ts` | `caja_estado_pane.dart` | COMPLETA | `GET /api/v1/caja` | — |
| Cierre de caja | `cerrarCaja()` en `fn.ts` | `cierre_controller.dart` | COMPLETA | `POST /api/v1/caja/cerrar` | — |
| Mesa de turno (widget resumen) | `mesa-turno.tsx` | — | AUSENTE | Web: barra compacta con cobrado, pedidos en curso, publicados en Mercado, stock bajo, pedidos de la app. Flutter: no tiene. | MEDIA |

### 3.4 Vendedor y pedidos

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Carrito (agregar/quitar/modificar) | `src/routes/vendedor.tsx` | `carrito_controller.dart` | COMPLETA | Ambos manejan líneas con cantidad | — |
| Crear pedido (idempotente) | `crearPedido()` en `fn.ts` | `carrito_controller.dart` `confirmar()` | COMPLETA | `POST /api/v1/pedidos` con clientUuid | — |
| Cola offline (outbox) | `offline-queue.ts` + `vendedor.tsx` | — | AUSENTE | Web: localStorage outbox, replay al reconectar. Flutter: `carrito.dart:33` dice explícitamente "sin persistencia offline". | ALTA |
| Listar pedidos del vendedor | `listPedidos()` con `?mine=1` | `pedidos_pane.dart` | COMPLETA | `GET /api/v1/pedidos?mine=1` | — |
| Detalle de pedido | `src/routes/vendedor.tsx` | `pedido_detalle_screen.dart` | COMPLETA | `GET /api/v1/pedidos/{id}` | — |
| Marcar como listo | `updatePedidoEstado()` en `fn.ts` | `caja_pane.dart` ("Marcar listo") | COMPLETA | `POST /api/v1/pedidos/{id}/estado` | — |
| Entregar pedido | `cerrarEntrega()` en `fn.ts` | `entrega_controller.dart` | COMPLETA | `POST /api/v1/pedidos/{id}/entregar` | — |
| Checklist de entrega (pantalla completa) | `entrega-lista.tsx` | — | DIFERENTE | Web: overlay con checkbox por ítem, cantidad editable, nota por ítem, entrega parcial con observación. Flutter: confirmación simple sin detalle por ítem. | MEDIA |
| Chat de pedidos (mensajería) | `pedido-chat.tsx` + `mensajes-fn.ts` | — | AUSENTE | Web: WebSocket en vivo, bandeja de entrada, mensajes paginados. Flutter: sin referencia a chat/mensajes. | MEDIA |

### 3.5 Clientes

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Listar clientes | `listClientes()` en `fn.ts` | `clientes_service.dart` `listar()` | COMPLETA | `GET /api/v1/clientes` | — |
| Crear cliente | `guardarCliente()` en `fn.ts` | `cliente_form_controller.dart` `crear()` | COMPLETA | `POST /api/v1/clientes` | — |
| Editar cliente (CUIT, dirección, IVA, activo) | `guardarCliente()` en `fn.ts` | `cliente_form_controller.dart` `actualizar()` | COMPLETA | `POST /api/v1/clientes/{id}` | — |
| Cuenta corriente (saldo + movimientos) | `listClientes()` con movimientos | `clientes_service.dart` `cuenta()` + `registrarPago()` | COMPLETA | `GET /api/v1/clientes/{id}/cuenta`, `POST /api/v1/clientes/{id}/pagos` | — |
| Clientes de la app (compradores Mercado) | `src/routes/clientes-app.tsx` | — | AUSENTE | Web: lista compradores Mercado, estado de verificación, estadísticas, ficha completa. Flutter: sin referencia. | BAJA (depende de Mercado) |

### 3.6 Proveedores y remitos

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Listar proveedores | `listProveedores()` en `fn.ts` | `proveedores_service.dart` `listar()` | COMPLETA | `GET /api/v1/proveedores` | — |
| Crear/editar proveedor | `guardarProveedor()` en `fn.ts` | `proveedores_service.dart` `crear()`/`actualizar()` | COMPLETA | `POST /api/v1/proveedores` | — |
| Productos del proveedor | `productosDelProveedor()` en `fn.ts` | `proveedores_service.dart` `productos()` | COMPLETA | `GET /api/v1/proveedores/{id}/productos` | — |
| Crear remito (manual) | `crearRemito()` en `fn.ts` | `remitos_service.dart` `crear()` | COMPLETA | `POST /api/v1/remitos` | — |
| OCR de remito (foto/archivo) | `crearRemito()` con OCR | `remito_alta_controller.dart` `leerFoto()` | COMPLETA | `POST /api/v1/remitos/ocr` | — |
| Detalle de remito | `getRemito()` en `fn.ts` | `remitos_service.dart` `obtener()` | COMPLETA | `GET /api/v1/remitos/{id}` | — |
| Confirmar ítems de remito | `actualizarRemitoItem()` en `fn.ts` | `remitos_service.dart` `actualizarItem()` | COMPLETA | `POST /api/v1/remitos/items` | — |
| Confirmar remito (aplica stock) | `confirmarRemito()` en `fn.ts` | `remitos_service.dart` `confirmar()` | COMPLETA | `POST /api/v1/remitos/{id}/confirmar` | — |
| Importar costos desde remito | `tomarCostosRemito()` en `costos-fn.ts` | — | AUSENTE | Web: importa costos de remito confirmado a gestión de costos. Flutter: no tiene gestión de costos. | MEDIA (depende de costos) |

### 3.7 Usuarios

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Listar usuarios | `listUsuarios()` en `fn.ts` | `usuarios_service.dart` `listar()` | COMPLETA | `GET /api/v1/usuarios` | — |
| Crear usuario | `createUsuario()` en `fn.ts` | `usuarios_service.dart` `crear()` | COMPLETA | `POST /api/v1/usuarios` | — |
| Activar/desactivar usuario | `toggleUsuario()` en `fn.ts` | `usuarios_service.dart` `toggle()` | COMPLETA | `POST /api/v1/usuarios/{id}/toggle` | — |
| Cambiar contraseña de usuario | `cambiarClaveUsuario()` en `fn.ts` | — | AUSENTE | Web: inline en `usuarios.tsx` con campo de nueva contraseña. Flutter: sin referencia. | ALTA |

### 3.8 Dashboard y reportes

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Resumen de KPIs (ventas, cobrado, pedidos) | `dashboardResumen()` en `fn.ts` | `dashboard_service.dart` `obtener()` | COMPLETA | `GET /api/v1/dashboard` | — |
| Desglose por forma de pago | `dashboardResumen()` con `porFormaPago` | `dashboard_pane.dart` | COMPLETA | Mismo endpoint | — |
| Gráficos interactivos (barras/líneas/área) | Recharts en `dashboard.tsx` | — | AUSENTE | Web: gráficos con Recharts, selector de tipo. Flutter: solo números. | BAJA |
| Ranking de cargadores | `rankingCargadores()` en `fn.ts` | `reportes_service.dart` `obtenerRankingCargadores()` | COMPLETA | `GET /api/v1/cargadores/ranking` | — |
| Más vendidos (7d/30d) | `resumenVentasProductos()` en `fn.ts` | `reportes_service.dart` `obtenerProductos()` | COMPLETA | `GET /api/v1/reportes/productos` | — |
| Historial diario por producto | `historialProducto()` en `fn.ts` | `reportes_service.dart` `obtenerHistorialProducto()` | COMPLETA | `GET /api/v1/reportes/productos/{id}/historial` | — |
| Identidad del puesto (editor) | `identidad-puesto.tsx` | — | AUSENTE | Web: editor de nombre, bajada, membrete, pie de ticket, imagen de fondo. Flutter: solo lectura de tenant. | MEDIA |
| Clima y dólar (widget) | `clima-dolar.tsx` | — | AUSENTE | Web: cotización dólar + clima de Mercado Central. Flutter: sin referencia. | BAJA (decorativo) |
| Alertas | `listAlertas()`, `marcarAlertaLeida()` en `fn.ts` | `alertas_service.dart` | COMPLETA | `GET /api/v1/alertas`, `POST /api/v1/alertas/{id}/leida` | — |
| Auditoría | `listAuditoria()` en `fn.ts` | `auditoria_service.dart` | COMPLETA | `GET /api/v1/auditoria` | — |

### 3.9 Suscripción y contrato

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Ver resumen de suscripción | `contrato-puesto.tsx` | `suscripcion_pane.dart` | COMPLETA | `GET /api/v1/suscripcion` | — |
| Ver contrato (documento completo) | `contrato-puesto.tsx` | `suscripcion_pane.dart` | COMPLETA | `GET /api/v1/suscripcion/contrato` | — |
| Ver historial de versiones | `contrato-puesto.tsx` | `suscripcion_pane.dart` | COMPLETA | `GET /api/v1/suscripcion/contrato/historial` | — |
| Aceptar versión pendiente | `checks-contrato.tsx` | `suscripcion_pane.dart` | COMPLETA | `POST /api/v1/suscripcion/contrato/aceptar` | — |
| Add-ons (catálogo y compra) | `src/routes/addons.tsx` | — | AUSENTE | Web: catálogo con precios USD/ARS, checkout con transferencia/cuenta corriente. Flutter: solo lista los add-ons contratados (read-only). | MEDIA |
| Puerta legal (gate de contrato) | `puerta-legal.tsx` | — | AUSENTE | Web: bloquea acceso hasta aceptar documentos pendientes. Flutter: no tiene gate. | MEDIA |

### 3.10 Escritorio del dueño

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Bandeja de mensajes | `escritorio.tsx` + `BandejaMensajes` | — | AUSENTE | Web: inbox de conversaciones de pedidos con conteo de no leídos. | MEDIA |
| Margen (ingresos vs costos) | `escritorio.tsx` tab "Margen" | — | AUSENTE | Web: cobrado, costo, diferencia, serie diaria, remitos confirmados. | ALTA |
| Deudas (cuentas por cobrar) | `escritorio.tsx` tab "Deudas" | — | AUSENTE | Web: quiénes deben, montos. | ALTA |
| Cierres históricos | `escritorio.tsx` tab "Cierres" | — | AUSENTE | Web: tabla de cierres con esperado vs real vs diferencia. | MEDIA |
| Lista publicada en Mercado | `escritorio.tsx` tab "Lista publicada" | — | AUSENTE | Web: productos visibles en Mercado al Toque. | BAJA (depende de Mercado) |

### 3.11 Marketing y publicidad

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Contratar productos de marketing | `src/routes/marketing.tsx` | — | AUSENTE | Web: catálogo de advertising/messaging con checkout. | BAJA |
| Banners (gestión) | `src/routes/marketing.tsx` tab "Banners" | — | AUSENTE | Web: plantillas, selección de producto, publicación. | BAJA |
| Creativos con IA | `creativos-fn.ts` + `marketing.tsx` tab "Creativos" | — | AUSENTE | Web: generación con DeepSeek (texto) + Qwen (imagen), sistema de créditos. | BAJA |

### 3.12 Sucursales

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Gestión de sucursales | `sucursales-puesto.tsx` + `sucursales-puesto.ts` | — | AUSENTE | Web: crear sucursal, cambiar activa, transferir stock, importar clientes. Flutter: solo `sucursalesContratadas` en modelo de suscripción. | MEDIA |

### 3.13 Facturación AFIP/ARCA

| Función | Web | Flutter | Estado | Evidencia | Prioridad |
|---------|-----|---------|--------|-----------|-----------|
| Ruta ARCA | `src/routes/arca.tsx` | — | AUSENTE | Web: placeholder "Próximamente". Sin funcionalidad real. | NO PRIORITARIA |
| Configuración AFIP | `facturacion-afip.tsx` + `afip-fn.ts` | — | AUSENTE | Web: CUIT, razón social, condición IVA, punto de venta, certificado/key PEM, ambiente. | BAJA (no habilitada) |
| Emisión de facturas | `afip-fn.ts` (`emitirFactura`, `emitirNotaCredito`) | — | AUSENTE | Web: integración WSAA/WSFE completa. | BAJA (no habilitada) |
| Detalle de factura | `src/routes/factura.$id.tsx` | — | AUSENTE | Web: vista de factura con datos AFIP, IVA, CAE, QR. Flutter: consciente de `facturaId` pero sin vista. | BAJA |

### 3.14 Funciones exclusivas de Flutter (no están en la web del Puesto)

| Función | Flutter | Web | Notas |
|---------|---------|-----|-------|
| Vista de Sesión con enlaces públicos | `_SesionPane` en `adaptive_shell.dart` | No tiene tab equivalente | Flutter muestra links de privacidad, términos, soporte, eliminar cuenta |

---

## 4. Funcionalidades completas (no tocar)

Estas funciones están implementadas correctamente en ambos lados y **no requieren trabajo**:

1. Login/logout con Better Auth
2. Restaurar sesión con token seguro
3. Redirect por rol (admin/cajero/vendedor)
4. Catálogo con búsqueda por nombre/alias y ETag caching
5. CRUD completo de productos (crear, editar, dar de baja)
6. Ajuste de stock (sumar, restar, merma)
7. CRUD completo de clientes (crear, editar, CUIT, IVA, dirección)
8. Cuenta corriente (saldo, movimientos, registrar pago)
9. CRUD completo de proveedores
10. Remitos (crear manual, OCR foto/archivo, confirmar ítems, confirmar remito)
11. CRUD de usuarios (crear, activar/desactivar)
12. Carrito de vendedor (agregar, quitar, modificar, confirmar pedido idempotente)
13. Pedidos del vendedor (listar, detalle, entregar)
14. Caja (listar pedidos, cobrar con 4 formas de pago, editar ítems, anular pedido, anular cobro)
15. Ticket (ver, imprimir PDF 80mm vía diálogo del sistema)
16. Cierre de caja (esperado vs contado, diferencia)
17. Dashboard con KPIs básicos (ventas, cobrado, pedidos, pendientes, stock bajo, alertas)
18. Reportes (más vendidos 7d/30d, historial diario, ranking cargadores)
19. Alertas (listar, marcar leída)
20. Auditoría (listar, ver detalle)
21. Suscripción (ver resumen, contrato, historial, aceptar versión pendiente)
22. Tema claro/oscuro persistente

---

## 5. Diferencias funcionales confirmadas

### 5.1 Entrega de pedido

- **Web**: overlay de pantalla completa con checkbox por ítem, cantidad editable, nota por ítem, entrega parcial con observación obligatoria, entrega total. Componente `entrega-lista.tsx`.
- **Flutter**: confirmación simple con diálogo de confirmación antes de llamar a `POST /api/v1/pedidos/{id}/entregar`. Sin detalle por ítem.

### 5.2 Historial de producto

- **Web**: visible tanto en la página de Productos (panel lateral) como en Reportes.
- **Flutter**: visible solo en Reportes (tab "Más vendidos" → tap en producto → historial 7d).

### 5.3 Impresión térmica

- **Web**: Web Bluetooth API para emparejamiento directo con impresora térmica USB/Bluetooth, reconexión automática, botón dedicado `TermicaBoton`.
- **Flutter**: genera PDF 80mm y abre diálogo de impresión del sistema operativo. Sin emparejamiento directo.

---

## 6. Riesgos técnicos y dependencias

### 6.1 Dependencias entre tareas

```
Costos y márgenes ←── Importar costos desde remito
                      (no se puede hacer B sin A)

Escritorio del dueño ←── Chat de pedidos
                         (la bandeja de mensajes requiere el módulo de chat)

Add-ons (compra) ←── Puerta legal
                     (el checkout de add-ons usa ChecksContrato)

Sucursales ←── Stock Board
               (la grilla visual podría integrar la lógica multi-sucursal)

Canal Mercado ←── Clientes de la app
                  (los compradores Mercado solo tienen sentido si se publica en Mercado)
```

### 6.2 Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| La cola offline requiere `shared_preferences` o similar en Flutter | Medio | Usar `shared_preferences` para el outbox; es liviano y multiplataforma. |
| WebSocket de chat no tiene equivalente nativo en Flutter | Medio | Usar paquete `web_socket_channel` o similar. El backend ya tiene endpoint WebSocket en `/api/mensajes`. |
| Costos y márgenes requiere nuevos endpoints o reutilizar existentes | Bajo | Los endpoints `guardarCosto`, `aplicarMargen`, `tomarCostosRemito` ya existen en el backend (server functions de la web). Flutter necesita que se expongan vía `/api/v1/` o usar server functions. |
| Impresión térmica Bluetooth en Windows vs Android | Medio | En Android se puede usar `flutter_blue_plus`; en Windows es más complejo. Prioridad baja. |
| Web Bluetooth API no tiene equivalente directo en Flutter | Alto | Descartar emparejamiento directo; mantener diálogo de impresión del sistema como fallback válido. |
| Algunos módulos (Marketing, Creativos IA, AFIP) son de baja prioridad o placeholder | Bajo | No incluir en el plan de paridad inmediato. |

### 6.3 Limitaciones de verificación

- **No se pudo verificar** si la versión web del ZIP es exactamente la última desplegada en producción. El AGENTS.md del ZIP describe un sandbox de Grok Build, lo que sugiere que es una versión de desarrollo/exportación.
- **No se ejecutaron tests** ni se levantaron servidores. Toda la evidencia proviene de inspección de código fuente.
- **Los endpoints de server functions** de la web (`createServerFn`) no están todos expuestos como REST `/api/v1/`. Algunos podrían requerir adaptación para que Flutter los consuma.

---

## 7. Plan de implementación por lotes

### Lote 1 — Operaciones críticas faltantes (ALTA prioridad)

**Objetivo**: cerrar gaps que afectan el día a día del negocio.

| Tarea | Descripción | Archivos nuevos/modificados | Endpoints |
|-------|-------------|---------------------------|-----------|
| 1.1 Cambiar contraseña de usuario | Agregar botón "Contraseña" inline en lista de usuarios, con campo y guardar | `usuarios_pane.dart`, `usuarios_service.dart` | `POST /api/v1/usuarios/{id}/clave` (o equivalente) |
| 1.2 Egresos de caja | Formulario de gasto por turno con categorías, concepto, monto, forma de pago. Lista de egresos del turno. | `egresos_pane.dart` (nuevo), `egresos_service.dart` (nuevo), integrar en `caja_pane.dart` | `GET /api/v1/egresos`, `POST /api/v1/egresos` |
| 1.3 Costos y márgenes | Panel de costo/margen por producto. Aplicar margen masivo. Importar costos desde remito confirmado. | `costos_pane.dart` (nuevo) o integrar en `productos_pane.dart`, `costos_service.dart` (nuevo) | `POST /api/v1/costos`, `POST /api/v1/costos/margen`, `POST /api/v1/costos/remito` |
| 1.4 Escritorio del dueño — Margen y Deudas | Panel con ingresos vs costos, cuentas por cobrar. | `escritorio_pane.dart` (nuevo), `escritorio_service.dart` (nuevo) | `GET /api/v1/escritorio` |

**Pruebas**: unit tests para controllers, e2e en Android y Windows verificando cada operación.

### Lote 2 — Comunicación y colaboración (MEDIA prioridad)

**Objetivo**: habilitar mensajería y checklist de entrega.

| Tarea | Descripción | Archivos nuevos/modificados | Endpoints |
|-------|-------------|---------------------------|-----------|
| 2.1 Chat de pedidos | WebSocket para mensajería en tiempo real entre cliente y negocio. Bandeja de entrada. | `chat_service.dart` (nuevo), `pedido_chat_pane.dart` (nuevo), `bandeja_mensajes_pane.dart` (nuevo) | WebSocket `/api/mensajes`, `GET /api/v1/mensajes/pedido/{id}`, `POST /api/v1/mensajes` |
| 2.2 Checklist de entrega | Overlay de pantalla completa con ítems, checkboxes, cantidades editables, notas, entrega parcial. | `entrega_checklist_dialog.dart` (nuevo), modificar `entrega_controller.dart` | `POST /api/v1/pedidos/{id}/entregar` (con payload ampliado) |
| 2.3 Cola offline | Outbox en `shared_preferences` para pedidos cuando no hay red. Replay al reconectar. | `offline_queue.dart` (nuevo), modificar `carrito_controller.dart` | Sin endpoint nuevo (reutiliza `POST /api/v1/pedidos`) |

**Pruebas**: e2e con red interrumpida para cola offline. Test de WebSocket con mensajes bidireccionales.

### Lote 3 — Gestión y visualización (MEDIA prioridad)

**Objetivo**: completar módulos de gestión existentes.

| Tarea | Descripción | Archivos nuevos/modificados | Endpoints |
|-------|-------------|---------------------------|-----------|
| 3.1 Identidad del puesto | Editor de nombre, bajada, membrete, pie de ticket, imagen de fondo. | `identidad_pane.dart` (nuevo), `identidad_service.dart` (nuevo) | `GET /api/v1/marca`, `POST /api/v1/marca` |
| 3.2 Mesa de turno | Widget resumen con cobrado, pedidos en curso, stock bajo, pedidos app. | `mesa_turno_pane.dart` (nuevo), integrar en dashboard o caja | `GET /api/v1/mesa-turno` |
| 3.3 Add-ons (compra) | Catálogo de add-ons con precios, checkout con transferencia/cuenta corriente. | `addons_pane.dart` (nuevo), `addons_service.dart` (nuevo) | `GET /api/v1/addons/catalogo`, `POST /api/v1/addons/confirmar` |
| 3.4 Puerta legal | Gate que bloquea acceso hasta aceptar documentos pendientes. | `puerta_legal_widget.dart` (nuevo), integrar en `adaptive_shell.dart` | `GET /api/v1/suscripcion/contrato/pendiente` |
| 3.5 Canal Mercado por producto | Toggle en ficha de producto para publicar/no publicar en Mercado. | Modificar `producto_form_dialog.dart`, `productos_service.dart` | `GET /api/v1/productos/{id}/canal`, `POST /api/v1/productos/{id}/canal` |

**Pruebas**: e2e verificando gate legal, compra de add-on, toggle de canal.

### Lote 4 — Sucursales y stock visual (MEDIA prioridad)

**Objetivo**: habilitar gestión multi-sucursal.

| Tarea | Descripción | Archivos nuevos/modificados | Endpoints |
|-------|-------------|---------------------------|-----------|
| 4.1 Gestión de sucursales | Crear sucursal, cambiar activa, ver ventas por sucursal. | `sucursales_pane.dart` (nuevo), `sucursales_service.dart` (nuevo) | `GET /api/v1/sucursales`, `POST /api/v1/sucursales`, `POST /api/v1/sucursales/{id}/activar` |
| 4.2 Transferencia de stock | Transferir stock entre sucursales. | Integrar en `sucursales_pane.dart` | `POST /api/v1/sucursales/transferir` |
| 4.3 Stock Board (grilla visual) | Grilla con barras de color, drag-to-reorder, creación rápida. | `stock_board_pane.dart` (nuevo) | Reutiliza endpoints de productos + `POST /api/v1/productos/orden` |

**Pruebas**: e2e con dos sucursales, transferencia de stock, reordenamiento.

### Lote 5 — Funciones de baja prioridad

| Tarea | Descripción | Prioridad |
|-------|-------------|-----------|
| 5.1 Clima y dólar widget | Widget decorativo con cotización y clima. | BAJA |
| 5.2 Gráficos en dashboard | Recharts-equivalente en Flutter (fl_chart). | BAJA |
| 5.3 Marketing y creativos IA | Catálogo, banners, generación con IA. | BAJA |
| 5.4 Clientes de la app | Gestión de compradores Mercado. | BAJA (depende de Mercado) |
| 5.5 Detalle de factura AFIP | Vista de factura con datos AFIP, CAE, QR. | BAJA (AFIP no habilitada) |
| 5.6 Impresión térmica Bluetooth | Emparejamiento directo en Android. | BAJA (fallback: diálogo del sistema) |
| 5.7 Historial de producto en ficha | Mostrar historial de ventas en la página de Productos. | BAJA (ya existe en Reportes) |

---

## 8. Pruebas necesarias por lote

| Lote | Tests unitarios | Tests e2e | Verificación manual |
|------|-----------------|-----------|---------------------|
| 1 | Controllers de egresos, costos, cambio de clave | Crear egreso → verificar en estado de caja. Ajustar costo → verificar precio calculado. | Windows + Android: flujo completo de cada operación. |
| 2 | Offline queue (enqueue/dequeue/flush), WebSocket chat | Enviar mensaje → recibir en otro cliente. Cortar red → crear pedido → reconectar → verificar replay. | Android con WiFi off/on. Windows con cable desconectado. |
| 3 | Gate legal (aceptar → desbloquear), add-on checkout | Crear contrato pendiente → verificar bloqueo → aceptar → verificar desbloqueo. | Windows + Android. |
| 4 | Transferencia de stock (saldo origen/s destino) | Crear sucursal → transferir stock → verificar en ambas. | Windows + Android. |
| 5 | — | Smoke test de cada widget. | Solo verificar que renderiza sin errores. |

---

## 9. Dudas que requieren verificación manual

1. **¿Los server functions de la web están expuestos como REST `/api/v1/`?** Algunos endpoints como `guardarCosto`, `aplicarMargen`, `tomarCostosRemito`, `egresosDelTurno`, `cargarEgreso`, `mesaTurno`, `escritorioDueno`, `publicarBanner`, `estadoCreativos`, `pedirCreativos` están definidos como `createServerFn` en la web. Verificar si el backend de `/api/v1/` ya los expone o hay que agregar rutas.

2. **¿El WebSocket de mensajes funciona contra el backend actual?** El endpoint `/api/mensajes` está definido en la web con `mensajes-socket.ts`. Verificar si está activo en el backend de producción/DEV.

3. **¿La versión web del ZIP es la última desplegada?** El AGENTS.md del ZIP describe un sandbox de Grok Build. No se pudo verificar que coincida con lo desplegado en mostrador.grok.me o Vercel.

4. **¿Qué endpoints de sucursales están disponibles en `/api/v1/`?** La web usa server functions (`sucursalesDelPuesto`, `crearSucursalPuesto`, etc.). Verificar si hay rutas REST equivalentes.

5. **¿El gate legal (`puerta-legal.tsx`) requiere un endpoint específico para consultar documentos pendientes?** La web usa `/api/central/v1/contracts/pending`. Verificar si Flutter puede consumirlo directamente o necesita un proxy en `/api/v1/`.

6. **¿La impresión térmica Bluetooth tiene prioridad real?** La web usa Web Bluetooth API que solo funciona en Chrome/Edge. En Flutter, el diálogo de impresión del sistema podría ser suficiente para Windows y Android.

7. **¿El módulo de Marketing/Creativos IA tiene backend activo?** Las server functions `pedirCreativos` y `estadoCreativos` usan DeepSeek y Qwen. Verificar si las API keys están configuradas en el backend.

---

## 10. Notas sobre alcance excluido

Las siguientes funcionalidades existen en la web pero son aplicaciones **separadas** y **no forman parte del alcance** de paridad de Flutter:

- **Torre de Control** (`/torre/*`): consola de administración SaaS multi-tenant. 19 sub-rutas.
- **Mercado al Toque** (`/mercado`): marketplace multi-vendor con compradores, cargadores y puestos.
- **Portal del Cliente** (`/portal`): autoservicio de clientes (catálogo, pedidos, cuenta).
- **ARCA** (`/arca`): placeholder "Próximamente" sin funcionalidad.
- **Facturación AFIP**: implementación completa en la web pero no habilitada operativamente.

---

*Fin del informe. No se modificó ningún archivo del proyecto.*
