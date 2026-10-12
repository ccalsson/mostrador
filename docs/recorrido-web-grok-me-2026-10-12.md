# Recorrido funcional de la web mostrador.grok.me — registro completo (2026-10-12)

Recorrido de punta a punta de las dos consolas publicadas en **https://mostrador.grok.me**,
hecho en navegador real (preview) sobre el deploy vigente y la Neon DEV compartida:

- **/dashboard** — Mostrador (ERP del puesto), sesión staff `dueno@frutasroman.com` (Román Quispe, Dueño).
- **/torre** — Torre de Control (consola interna), acceso por `torre.saas_access` (rol `administracion`).

Alcance: 14 vistas del puesto + modales/paneles, y 19 secciones de la Torre. Se ejecutaron
mutaciones reales solo en DEV (venta directa, alta de cliente, pedido→caja→entregado, pedido de
add-on); las acciones destructivas o financieras (cierre de turno, contratar, eliminar, ajustes de
stock) se abrieron y validaron en UI pero **no** se ejecutaron.

---

## A. /dashboard — Mostrador (consola del puesto)

### Sitemap
- **Operación**: Caja · Puesto · Remitos · ARCA
- **Catálogo**: Productos · Proveedores · Clientes · De la app
- **Administración**: Add-ons · Usuarios · Contrato
- **Marketing**: Marketing
- **Informes**: Tablero · Auditoría

### Tablero (raíz /dashboard)
- Ticker: dólar dolarapi ($1.535 / $1.485) y clima Mercado Central 15° nublado.
- Filtros Hoy / 7d / 30d; gráfico con modos Barras / Línea y series Medios / Productos / Pesos /
  Tickets; botón Alertas (1).
- Cards narrativos: Tus resultados · Tu producto · El mercado · Actividad · Trial Pro (21 días).
- Métricas: Ventas 7d **$922.500**, Ticket promedio **$92.250**, Tickets **10**, En cola **4**.
- Stock: 68 celdas · 4 en cero, con acciones Mover / Quitar por producto.
- Ventas 06/10–12/10 (eje 0k–600k). Movimientos: 10 tickets → detalle `/ticket/cob_*`.
- Productos del período: Ajo $408.000 · Ají $234.000 · Acelga $108.000 · Achicoria $90.000 ·
  Akusay $72.000 · Espinaca $10.500.
- Ranking cargadores: 1° Claudio Nuevo (4).
- Panel Alertas: Ajo -1 · Acelga 0 · Cierre de caja diferencia **-888000** · Akusay 0 · Ajo 0 ·
  Acelga 3 (acción Marcar leída).
- Modal **Identidad del puesto**: Nombre "Frutas Román, el Jujeño", Bajada, Membrete,
  Pie del ticket ("Gracias por su compra. Cambio y reclamos el mismo día. Mercado Central — Nave 3."),
  Fondo pantalla inactiva, Guardar identidad.

### Caja
- Pantalla de caja con **venta directa** ejecutada en DEV (ticket Nº 10 generado) y flujo de cierre
  de caja abierto (no confirmado).

### Puesto
- Alta real de cliente **"Cliente Prueba Web"** y ciclo completo **pedido → caja → entregado** en DEV.

### Remitos
- Listado y flujos de remitos operativos (paridad con app/ validada en fases previas).

### ARCA
- Vista presente con contenido placeholder (facturación aún no funcional).

### Productos / Proveedores / Clientes / De la app
- ABM operativos; catálogo "De la app" (productos origen app) visible.

### Add-ons / Usuarios / Contrato
- **Add-ons**: catálogo con precios y flujo de pedido/Checkout. Quedó un pedido **Banner home
  USD 50 "a cargo en cuenta"** (visible luego en la Torre como pendiente de habilitar).
- **Usuarios**: listado de usuarios del puesto.
- **Contrato**: vista contractual del tenant.

### Marketing
- Ofertas: Banner categoría USD 25 · $40.300 (Contratar) · Banner home USD 50 · $80.600
  (Esperando habilitación) · Destacado búsqueda USD 13 · $21.000 · Push 10.000 USD 20 ·
  Push 50.000 USD 65.
- Banner activo `category` 2026-10-09→16 ("Banana Ecuador") con acciones Cambiar producto
  (disabled durante la ventana) y métricas.

### Auditoría
- 49 eventos con acción / actor / tipo / fecha y acción "ver"; detalle inline (p. ej. Referencia
  `ped_710fda58baf5445b`, estado `enviado`).

---

## B. /torre — Torre de Control (consola interna)

### Gate y sesión
- Primera carga mostró "Esta consola no está habilitada para tu usuario" con botón
  "Entrar con otra cuenta" (gate transitorio); tras re-autenticar, la consola cargó completa.
- El acceso se resuelve contra `torre.saas_access` (la cuenta vigente figura como
  `calssonclaudio@gmail.com · administracion · vos` en Configuración).

### Sitemap (19 secciones)
- **COMERCIAL**: Tablero (1) · Tenants · Clientes · Planes · Add-ons y precios · Servicios ·
  Suscripciones · Sucursales · Promociones y founders · Publicidad · Finanzas
- **LEGAL**: Documentos y contratos · Procesadores
- **OPERACIÓN**: Mostrador y Mercado
- **AUDITORÍA**: Eventos
- **PLATAFORMA**: Aplicaciones · Versiones · Deployments · Configuración

### Tablero (/torre)
- **Pedidos para habilitar**: Frutas Román pidió Banner home USD 50 · a cargo en cuenta (+ Habilitar).
- KPIs: Aplicaciones activas 2 · Clientes activos 1 · Tenants activos 2 · Ingresos mes ARS 245000 ·
  Gastos 23000 · MRR USD 90 · Pendiente cobro USD 50 · Planes 2 · Suscripciones 1 (Base 0 / Mercado 1) ·
  Sucursales 1 · Add-ons 1 · Publicidad activa 0 · Packs 0 · Legales 0/4 · Contratos pendientes 0 ·
  Aceptaciones 0 · Releases 2.
- Aplicaciones: Mercado al Toque (0 tenants · sin versión · Activa) · Mostrador (2 tenants · 1.0.5 · Activa).
- Alertas: Puesto 03 en 1.0.4 vs 1.0.5 · Mercado sin versiones · Deployment fallido Mostrador·Puesto 03 ·
  Contrato por vencer Frutas Román 2026-10-16.
- Actividad: `pedir_addon` calssonclaudio@gmail.com 2026-10-12 14:08 · `contratar` 10-09 ·
  `alta_sucursal` + `contratar_sucursal_extra` 10-08.

### Tenants
- Tabla: Frutas Román · Mostrador · Full · Activo · 1.0.5 ✓ · 2026-10-05 | Puesto 03 · Mostrador ·
  Base · Activo · 1.0.4 ⚠ · 2026-09-23. Filtro / Nuevo / Ver.
- Ficha: Aplicación, Cliente, Nombre, Slug (`frutas-roman`), Plan (Sin plan/Base/Full), Estado
  (Activo/Inactivo), Versión instalada, Referencia operativa; nota "La contraseña del puesto la
  cambia el dueño, no Torre."; Guardar / Desactivar.

### Clientes
- Encabezado: "Clientes de la software house. No son los clientes del puesto."
- Card Frutas Román ("Frutas Román, el Jujeño", active). Ficha: Nombre, Razón social, Contacto
  (Román Quispe), Teléfono/Email/Notas (vacíos), Estado (Activo/Pausado/Archivado); Guardar.

### Planes
- Base ARS 150000/mes · Full ARS 200000/mes.
- Ficha: Código (`plan-base`), Descripción, Moneda (USD/ARS), Periodicidad (Mensual/Anual/Única),
  Precio mensual, Puesta en marcha, Vigente desde/hasta, Funcionalidades JSON `[]`,
  Límites JSON `{}`, Metadata JSON (`catalogSlug: mostrador-base`, `priceSource: saas_subscription_lines`),
  Estado (Activo/Archivado).

### Add-ons y precios (/torre/productos)
- Nota: catálogo en dólares (oficial 1535). 11 ítems: Banner categoría/hombre · Cargador comisión
  10–15% (sin precio) · Comprador free · Destacado búsqueda · MAT Presencia USD 32 · MAT Pro USD 65 ·
  Mostrador Base (impl. USD 1000 + abono USD 100) · Push 10.000/50.000 · Sucursal extra USD 25.
- Ficha (MAT Pro): Tipo (Producto base/Add-on/Sucursal/Suscripción/Publicidad/Mensajería/Comisión/
  Sin cargo), Aplicación, Modalidad (Único/Recurrente/Comisión/Sin cargo), Frecuencia,
  Implementación / Recurrente / Único en USD/ARS, Unidad (puesto), Configuración JSON
  (`{tier: pro, family: mercado, replaces: mercado-presencia}`).

### Servicios
- Tenant: Frutas Román / Puesto 03. Mensual contratado USD 90 · A cobrar ahora USD 90.
- Contratado: Sucursal extra (25, desde 10-08) · Banner categoría (25, 10-09→16) ·
  MAT Presencia (32, ended, "Presencia mínima") · MAT Pro (65, desde 2026-10-12, "Pro de prueba").
- Sucursales: `roman!` adicional active. Contratar: Moneda (USD/ARS), Cantidad, Notas + Contratar / Reemplazar.

### Suscripciones
- Card Frutas Román · Full · próx. 2026-10-25 · ARS 200000 · active; líneas contratado vs a cobrar.
- Ficha: Cliente / Tenant / Plan / Precio mensual 200000 / Inicio 2026-08-26 / Próximo pago 2026-10-25 /
  Estado (Pendiente/Activa/Vencida/Pausada/Suspendida/Cancelada).

### Sucursales
- Nota: "La primera sucursal cubierta por el producto base no se cobra…".
- `roman!` · Sucursal `fatima` · desde 2026-10-08 · Adicional · Activa (Editar/Desactivar).

### Promociones y founders
- Plantilla "Fundador Mercado al Toque" (draft): JSON `bonusMonths 6`, `frozenMonths 12`,
  `productSlugs [mercado-presencia, mercado-pro]`, `commissionPercent 0`.
- Form de plantilla (Borrador/Activa/Archivada); Ajustes (vacío); Asignaciones (Promoción / Tenant /
  Desde / Hasta / Condiciones / Referencia / Asignar).

### Publicidad
- Catálogo publicitario (`banner-categoria`, `banner-home`, `destacado-busqueda`, `push` con JSON).
- Placement Banner categoría · Frutas Román · `category` · 10-09→16 · USD 25 · Estado configurable
  (Borrador/Pago pendiente/Programado/Activo/Vencido/Cancelado) = "Programado". Packs de envío (vacío).

### Finanzas
- Ingresos (+ Registrar): Banner home USD 50 (publicidad, `pending`, "A cargo en cuenta") ·
  soporte ARS 200000 (`paid`) · Abono Mostrador ARS 45000 (`paid`).
- Gastos (+ Registrar): Base Postgres Neon monthly 15000 · Dominio Registro yearly 8000 (sin moneda).

### Documentos y contratos (/torre/legal)
- 4 borradores: Privacidad · Relación comercial del puesto · Términos cargador · Términos comprador.
- Form de documento: Audiencia (Puesto/Comprador/Cargador/Privacidad/Otro) + checkbox de reaceptación.
- Publicar versión (Documento / Etiqueta / Texto). "Ofrecer al puesto" (disabled, sin versiones).
  Aceptaciones (vacío).

### Procesadores
- Neon (database) y Vercel (hosting), ambos "Pendiente de revisión jurídica".
- Form: Nombre / Categoría / Para qué se usa / Nota jurídica.

### Mostrador y Mercado (/torre/mercado)
- En línea ahora: Puestos 1/1 · Personal 5 (= 5 dueños) · Compradores 2/4 · Cargadores 1 disponibles · 2 activos.
- Registrados: Dueños 2 · Cajeros 1 · Vendedores 1 · Clientes 10 (4 con cuenta) · Proveedores 0 ·
  Compradores 4 · Cargadores 2 · Productos 69 (65 Mercado).
- Las dos apps: Mostrador $406.500 (2 cobros) · Mercado $516.000 (8 cobros). Chart de cobros por día.
- Mostrador: Efectivo 2 · $406.500; Entregado 2 · $406.500; En caja 1 · $24.000; productos
  Ají $234.000 / Ajo $168.000 / Acelga $4.500; stock movido: Liberación 12·57 / Reserva 6·-8 /
  Venta 4·-21 / Ajuste 1·10; Cierres 1 (diferencia -$888.000).
- Mercado: Efectivo 4 · $285.000 / Transferencia 4 · $231.000; Entregado 7 · $505.500;
  En caja 3 · $60.940; Cobrado 1 · $10.500; recorridos cargadores Aceptado 2 / Entregado 2.
- Puestos por facturación: Frutas Román, 10 tickets — Mostrador $406.500 · Mercado $516.000.
- Puestos con alguien adentro: 5 × Dueño.

### Eventos (/torre/auditoria)
- Tabs: Eventos / Cambios comerciales / Cambios contractuales.
- 4 eventos con JSON: `pedir_addon` / payment `pay_bb27edda546843cf` (2026-10-12 14:08) ·
  `contratar` / `lin_4819831909484c3d` (10-09) · `alta_sucursal` / `br_5a606fbfd36f46f6` (10-08) ·
  `contratar_sucursal_extra` / `lin_684c0ac065284e26` (10-08).

### Aplicaciones
- Mercado al Toque (sin versión) · Mostrador (1.0.5).
- Ficha Mostrador: Slug `mostrador`, Descripción "Puesto del Mercado Central.",
  Producción `https://mostrador.grok.me`, Estado (Activa/Pausada/Archivada).

### Versiones
- Selector de aplicación (el `<select>` nativo no respondió a click del navegador headless; se cambió
  por evento `change` programático).
- Mostrador 1.0.5 disponible; instaladas: Frutas Román 1.0.5 ✓ · Puesto 03 1.0.4 ⚠.
- Historial: 1.0.5 web published 2026-10-03 ("Clientes del puesto y login limpio.") con acciones
  Publicar en Torre / Recomendar anterior; 1.0.4 web published 2026-09-15 ("Caja y remitos.");
  "Quién puede actualizar" (vacío).

### Deployments
- Nota: "Torre anota el deployment. No instala el dispositivo. Publicado en infraestructura solo si el
  registro dice que se confirmó."
- Registros: Mostrador · 1.0.5 · Puesto 03 · web · **Fallido** · manual · 2026-10-04 18:03
  ("Quedó en la versión anterior.") · Mostrador · 1.0.5 · Frutas Román · web · **Publicado** · manual ·
  2026-10-03 18:03 ("Publicación web."). Ambos: "Publicado o anotado en Torre, sin confirmación".
  Botón Registrar. Aviso de add-on pendiente de habilitación.

### Configuración
- **Tipo de cambio de referencia**: "dólar oficial vendedor Banco Nación: 1540 ARS por USD al
  2026-10-07. No reescribe contratos." Form: Fuente / Fecha / ARS por USD (**vacío**) + Guardar.
- **Medios de pago**: "Todavía no hay alias ni CBU. Sin eso el puesto no sabe a dónde transferir."
  Form: Alias / CBU (22 números) + Guardar. Nota "La tarjeta queda para más adelante."
- **Accesos Torre**: "Solo estas cuentas pueden abrir la Torre. El puesto no entra."
  Form: correo autorizado + rol (Administración/Comercial/Legal/Soporte/Auditoría) + Agregar.
  Lista: `calssonclaudio@gmail.com · administracion · vos`.

---

## Pruebas funcionales ejecutadas (solo DEV)

| Prueba | Resultado |
| --- | --- |
| Login web staff (dueño) en /dashboard | OK |
| Venta directa en Caja | Ticket Nº 10 generado |
| Alta de cliente desde Puesto | "Cliente Prueba Web" creado |
| Ciclo pedido → caja → entregado | OK |
| Pedido de add-on Banner home (Checkout) | Queda "a cargo en cuenta"; aparece en Torre como pendiente de habilitar |
| Re-autenticación en gate de Torre | OK (carga la consola) |

## Observaciones y posibles gaps (verificar, no bloqueantes)

1. **Deployment fallido vigente**: Puesto 03 quedó en 1.0.4 (deployment 2026-10-04 "Fallido") y la
   alerta sigue activa en el Tablero de Torre.
2. **Contrato por vencer**: Frutas Román vence 2026-10-16 según alertas de Torre.
3. **Configuración incompleta en Torre**: sin ARS por USD cargado y sin Alias/CBU de medios de pago.
4. **Tipo de cambio**: el catálogo de Torre usa 1535 (oficial) mientras Configuración fija la
   referencia en 1540 al 2026-10-07 — verificar si la diferencia por fecha es intencional.
5. **Add-on "Banner home"** quedó esperando habilitación en Torre y "Esperando habilitación" en
   Marketing del puesto — consistente entre consolas.
6. **ARCA en /dashboard** es placeholder (sin funcionalidad).
7. **Cierre de caja con diferencia -$888.000** visible en alertas del Tablero y en métricas de Torre
   (Mostrador, Cierres 1) — dato coherente entre consolas; revisar si es dato de prueba DEV.
8. **Terminología**: uso consistente de "cargador" en todo lo recorrido (ranking cargadores,
   Términos cargador, Cargador comisión).
9. **Botón "Ofrecer al puesto"** en Legal está disabled por no haber versiones publicadas de los
   documentos (4 borradores) — comportamiento esperado, pero deja el circuito de aceptaciones sin uso.

## Evidencia

- Snapshots de accesibilidad de todas las vistas (14 del puesto + 19 de Torre) y capturas de página
  completa durante el recorrido (Marketing, Auditoría, Tableros de ambas consolas, Configuración).
- Datos cruzados entre consolas coincidentes: pedido de add-on, métricas de Mostrador/Mercado,
  alertas de versión y eventos de auditoría.
