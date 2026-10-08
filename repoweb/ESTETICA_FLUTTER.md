# Estética de Mostrador — contrato para Flutter

Documento visual de la versión web actual. No es una lista de features. Es lo que hay que verse igual: tres superficies, una paleta, dos tipografías, modo claro y oscuro.

No copiar marca de plataforma. No pie “created with”. No púrpura, no neón, no fotos de personas, no logos de terceros.

---

## 1. Tres apps, tres carcasas

| Superficie | Quién la usa | Ancho | Fondo | Barra |
|---|---|---|---|---|
| Mostrador | Dueño, caja, vendedor | hasta 1400 px | papel | verde oscuro, fija arriba, menú horizontal con scroll |
| Mercado al Toque | Comprador y changarín | 448 px, centrado, una columna | papel | sin barra verde; título serif grande |
| Torre de Control | Solo el administrador | sidebar 224 px en escritorio | papel a la derecha, casi negro a la izquierda | en el teléfono la sidebar se aplasta y el menú scrollea en horizontal |

Mostrador no es un dashboard genérico. Mercado no hereda la barra del puesto. Torre no usa el verde del puesto: es consola interna, más oscura y más seca.

---

## 2. Paleta

Modo claro es el default. Modo oscuro existe y se recuerda en el dispositivo (`mostrador-tema`: `claro` / `oscuro`). Si no hay preferencia guardada, sigue el sistema.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| paper | `#F3EDE1` | `#14110E` | fondo de página |
| paper-2 | `#E7DDCC` | `#241E18` | filas, hover, franjas |
| surface | `#FFFAF2` | `#1C1814` | tarjetas, inputs, botones secundarios |
| ink | `#1A1612` | `#F3EDE1` | texto principal |
| ink-soft | `#3D352C` | `#DDD2C3` | bajada, texto secundario |
| muted | `#6D6559` | `#B3A394` | ayudas, metadatos |
| line | `#D6CCBB` | `#3D342C` | bordes |
| leaf | `#1B5E3B` | `#3FA36E` | acción principal, foco, links |
| leaf-2 | `#0F3D26` | `#0E3324` | barra del puesto, títulos de marca |
| leaf-fg | `#F4EFE4` | `#F4EFE4` | texto sobre verde |
| terra | `#B5471A` | `#E17A45` | error, acción peligrosa, ítem de menú activo, filete del título |
| ok | `#2C6B45` | `#8FD4AE` | éxito |
| ok-bg | `#DCE8E0` | `#1A3328` | chip de éxito |
| warn-bg | `#F4E1D4` | `#3A261E` | chip de aviso |
| naranja | `#C46B14` | `#E39245` | acento cálido, no botón principal |
| ambar | `#C9A227` | `#E3C56A` | bajada del puesto, rol, etiqueta “Interna” de Torre |
| alerta | `#9B2330` | `#E07078` | stock crítico, no confundir con terra |

Regla: el verde hace, el terracota marca lo activo o lo que duele, el ámbar es etiqueta, el papel es el fondo. Nunca invertir eso.

---

## 3. Tipografía

- Texto: **IBM Plex Sans**. Si no está, sans del sistema.
- Títulos y nombre del puesto: **Fraunces**. Si no está, serif (Times).
- Números de plata, saldos y totales: tabular figures.
- Ticket térmico: monoespaciada, 12 px, interlineado 1.25. Courier si no hay otra.
- Mayúsculas chicas con tracking solo en etiquetas de marca: “MOSTRADOR”, “INTERNA”. No titular pantallas enteras en mayúscula.
- Títulos con `balance`. Párrafos con corte parejo. No justificar.

Tamaños de referencia:

- Nombre del puesto en el login: 26 px en teléfono, 36 px en ancho.
- Título de pantalla en Mostrador: 20 px, 24 px desde 640 px, con una barra vertical terracota de 4×20 px a la izquierda.
- Mercado, login: 30 px serif.
- Torre, título de página: 24 px serif.
- Menú del puesto: 12 px en teléfono, 14 px después.

---

## 4. Forma

- Radio chico 8 px. Medio 12 px. Tarjetas y sheets 20 px. Píldoras 28 px o `full`.
- Botones del menú y chips: 10 px.
- Botón principal: alto 44 px, radio 12 px, fondo leaf, texto leaf-fg, sombra de 1 px. Al tocar, escala 0.98. Deshabilitado: opacidad 40 %.
- Secundario: surface, borde line, texto ink.
- Peligro: terra, texto blanco.
- Aviso: fondo warn-bg, texto terra.
- Input: alto 44 px, radio 12 px, borde line, fondo surface, texto 16 px (para que el teléfono no haga zoom). Foco: borde leaf y anillo leaf al 20 %.
- Tarjeta de login: surface, borde line, filete superior de 4 px leaf, sombra verde muy suave `0 12 40 rgba(15,61,38,0.08)`.
- Separadores de ticket: línea punteada negra, no la paleta de la app.
- Iconos: trazo fino, 16 px en el menú, 14 px en el indicador de red. Sin rellenos ilustrados.

---

## 5. Mostrador (puesto)

Barra superior sticky, fondo leaf-2, texto leaf-fg.

1. Izquierda: nombre del puesto en Fraunces, truncado. Debajo, bajada en ámbar. Si hay membrete, una tercera línea al 60 % de blanco, también truncada.
2. Derecha: chip de red (“En red” / “Modo local”), chip de rol en ámbar (solo en pantallas anchas), botón sol/luna, usuario.
3. Segunda fila: menú horizontal con scroll. Ítem activo: fondo terra, texto blanco, radio 10 px, alto 36 px. Inactivo: texto crema al 80 %, sin pastilla.

El menú no es un drawer. En el teléfono se desliza de costado. No apilar los ítems en una columna que empuje el contenido.

Fondo de trabajo: paper. Contenido con padding 12 px en teléfono y 20 px desde 640 px.

Estados vacíos y de carga: centrados en toda la pantalla, texto muted, sin spinner de marca ajena. El splash de sesión usa leaf-2 y, si el puesto tiene foto de fondo, un velo verde `rgba(22,36,26,0.72)` a `0.82` encima de la foto. Ahí el nombre va en Fraunces crema.

Login, en teléfono, es una columna: primero la marca, después el formulario. Desde ancho grande, dos columnas. Si hay foto de fondo, velo paper al 90 % para que el formulario se lea. El botón de tema queda fijo arriba a la derecha, sobre surface, no sobre la barra verde.

No mostrar “crear cuenta de cliente” en el login del puesto.

---

## 6. Mercado al Toque

Una sola columna, máximo 448 px, padding 16 px, fondo paper.

- Título “Mercado al Toque” en Fraunces, 30 px.
- Bajada muted, 14 px: comprar en los puestos o entrar como changarín.
- Dos botones iguales en grilla de 2: Comprador y Changarín. El elegido es primario (leaf). El otro es secundario.
- La palabra de interfaz es **Changarín**. No escribir “cargador” en pantalla.
- Documentación (DNI y selfie) es una pantalla propia, título “Documentación”, antes del listado. No es un modal.
- Adentro, tres botones iguales: Puestos, Carrito, Pedidos. El activo es primario.
- Bultos se muestran como número, no como adorno. Comprador y changarín ven la misma cuenta de bultos.

---

## 7. Torre

No es la piel del puesto.

- Panel izquierdo fijo en escritorio: fondo `#14110E`, texto `#F4EFE4`, ancho 224 px.
- Kicker “INTERNA” en ámbar, 11 px, tracking abierto, mayúsculas.
- Título “Torre de Control” en Fraunces.
- Ítem activo: blanco al 15 %, radio 10 px. Inactivo: crema al 75 %.
- En el teléfono ese panel no es un drawer lateral: queda arriba, borde inferior, y las secciones scrollean en horizontal. El contenido no queda tapado por una franja blanca.
- El área de trabajo usa paper e ink del tema. Los títulos no llevan el filete terracota del puesto.

---

## 8. Ticket y papeles

El ticket no usa la paleta. Es papel blanco, tinta negra, 80 mm, mono.

- Encabezado centrado: nombre del puesto a 15 px semibold, bajada, membrete, “Ticket Nº”, fecha `es-AR`.
- Línea punteada.
- Líneas: cantidad, unidad, nombre a la izquierda; importe a la derecha.
- TOTAL en semibold.
- Forma de pago y vuelto.
- Pie del puesto, centrado.
- Al imprimir, el resto de la app desaparece. El ticket sale en página 80 mm. La factura, en A4 con margen 12 mm, también en negro sobre blanco.

---

## 9. Marca del puesto (no hardcodear Frutas Román en cada pantalla)

Estos campos vienen del tenant y pisan el texto fijo:

- nombre
- bajada (si falta, “Mostrador” en la barra y “Mercado Central” en el ticket)
- membrete (varias líneas)
- foto de fondo, solo en login y splash, siempre con velo

Los colores de arriba no cambian por puesto. Cambia el texto y la foto.

---

## 10. Lo que no hay que redibujar

- Sin gradientes violeta, sin glass, sin cards flotando con sombra grande.
- Sin ilustraciones de gente, de camiones ni de verdura de stock.
- Sin footer de herramienta.
- El modo oscuro recolorea tokens. No invierte una captura del modo claro.
- Errores en terra, 14 px, debajo del campo. Éxito en ok. No usar rojo puro `#FF0000` ni verde puro `#00FF00`.
- Montos en pesos argentinos, separador local, sin símbolo inventado.
