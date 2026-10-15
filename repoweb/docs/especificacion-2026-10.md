# Especificación de cambios — 11 al 14 de octubre de 2026

Documento de lo que quedó armado en Mostrador, Mercado al Toque y Torre. No incluye código. Ninguna clave de tercero está guardada en el repositorio: el servidor las lee de variables de entorno en el momento del pedido. Si faltan, la función no corre y, en Creativos, no se descuentan créditos.

## Tecnología

| Capa | Qué usa |
|---|---|
| Web | TanStack Start, React, Vite |
| Datos | Postgres (Neon en producción). Las consultas van con parámetros, no se arma SQL con texto del usuario |
| Sesión del puesto | better-auth. El alta por correo exige `emailVerified` |
| Correo | Resend, `POST https://api.resend.com/emails` |
| Captcha | Cloudflare Turnstile |
| Texto de creativos | DeepSeek, modelo por defecto `deepseek-v4-flash` |
| Imagen de creativos | Qwen Image (Alibaba Model Studio / DashScope). En el pedido se lo nombró Queen; quedó conectado como Qwen |
| Cupo de intentos | Tabla `seguridad_cupo` en Postgres, compartida entre servidores. Si la base no responde, queda un cupo de memoria solo en esa instancia |
| Android Mercado | Kotlin, Jetpack Compose. El captcha es un WebView |
| Android Torre | App aparte, API `/api/torre/v1` |

## Variables que hay que cargar

Van en el proyecto de Vercel. No van en el código ni en el chat.

| Variable | Obligatoria para | Qué es |
|---|---|---|
| `RESEND_API_KEY` | Confirmar correo y recuperar clave | Clave de Resend. Empieza con `re_` |
| `RESEND_FROM` | Lo mismo | Remitente de un dominio ya verificado. Ejemplo: `Mostrador <avisos@tudominio.com>` |
| `TURNSTILE_SECRET_KEY` | Alta en el sitio publicado | Secreto del widget de Cloudflare |
| `VITE_TURNSTILE_SITE_KEY` | Mostrar el captcha en la web | Clave pública. El prefijo `VITE_` la hace visible al navegador. No es un secreto |
| `DEEPSEEK_API_KEY` | Textos de Creativos | Clave de DeepSeek |
| `QWEN_API_KEY` | La foto de Creativos | Clave de Alibaba Model Studio |
| `QWEN_API_URL` | No | Si la cuenta no usa Singapur, reemplaza la dirección. Por defecto: `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` |
| `QWEN_MODEL` | No | Por defecto `qwen-image-3.0-pro` |
| `DEEPSEEK_MODEL` | No | Por defecto `deepseek-v4-flash` |
| `BETTER_AUTH_URL` | No | Si está, los enlaces de correo salen con esa dirección. Si no, se arma con el host del pedido |
| `DATABASE_URL` | Producción | Ya la inyecta la plataforma |
| `TORRE_INITIAL_PASSWORD` | Solo el primer usuario de Torre, si se usa | No es la cuenta de prueba del puesto |

Sin `RESEND_API_KEY` y `RESEND_FROM` juntas, no se manda nada. No hay remitente de prueba.

Sin `TURNSTILE_SECRET_KEY`, en Vercel el alta queda cerrada. Fuera de Vercel (el entorno de prueba local) el alta sigue, para poder probar.

Sin `DEEPSEEK_API_KEY` o `QWEN_API_KEY`, Creativos responde el error y no cobra.

## Android, aparte de Vercel

En `android/mercado/app/src/main/res/values/strings.xml`, la clave `turnstile_site_key` tiene que llevar la misma clave pública de Turnstile. Si queda vacía, Crear cuenta en el teléfono no pasa cuando el captcha está activo. El WebView carga la página con origen `https://mostrador.grok.me`. Ese dominio tiene que estar en el widget de Cloudflare.

Después de pegar la clave, hay que volver a compilar.

## Seguridad del alta y del ingreso

### Correo

- Se pasa a minúsculas. Largo de 6 a 254.
- Tiene que parecer un correo real. Se rechazan `localhost`, `.local`, `.test`, `.invalid`, `example.com` y `example.org`.
- Se rechazan dominios descartables: mailinator, guerrillamail, yopmail, tempmail, 10minutemail, trashmail y una lista corta del mismo tipo.
- La cuenta se crea sin poder entrar. El enlace de confirmación dura 24 horas. El token se guarda solo como hash SHA-256.
- En Mercado, `ingresar` exige `emailVerified`. Google entra porque Google ya confirmó ese correo.
- Recuperar la clave manda otro enlace, de 30 minutos. La respuesta no dice si el correo existe.

### Clave

- Entre 8 y 72 caracteres.
- Se rechazan claves flojas: `12345678`, `password`, `qwertyui`, `mostrador`, `mercado1` y la que sea igual al correo.
- Esto vale para cuentas nuevas. No cambia claves que ya estaban cargadas.

### Captcha

- En el alta de comprador, cargador y cliente del puesto.
- Campo oculto `website`: si viene con texto, se finge que el alta salió y no se crea la cuenta.
- Con el secreto cargado, el servidor manda el token a `https://challenges.cloudflare.com/turnstile/v0/siteverify`.

### Cupo por IP

La IP sale de `x-real-ip` o, si no está, del primer valor de `x-forwarded-for`. Se corta a 64 caracteres. En el Mercado Central mucha gente comparte red, por eso los topes de lectura y de ingreso no son los de un solo teléfono.

| Qué | Tope | Ventana |
|---|---|---|
| Alta Mercado, por IP | 80 | 1 hora |
| Ingreso Mercado, por IP | 40 | 15 minutos |
| Ingreso Mercado, por correo | 8 | 15 minutos |
| Lectura pública de Mercado | 600 | 1 minuto |
| Uso autenticado de Mercado | 120 | 1 minuto |
| Alta web del puesto (`sign-up`) | 40 | 1 hora |
| Ingreso web del puesto (`sign-in`) | 60 | 15 minutos |
| Alta de cliente del puesto | 40 | 1 hora |
| Recuperar clave | 20 | 1 hora |
| Reenviar confirmación | 20 | 1 hora |
| Ingreso Torre móvil | 30 | 15 minutos |
| Creativos, por puesto | 12 | 1 hora |

Si se pasa, la respuesta es 429 y no dice el detalle interno.

### Tamaño

- Pedido común de Mercado: hasta 24 KB.
- Comprobante, identidad o perfil del cargador: hasta 1,5 MB.

### Cuenta de prueba

Sigue creada con la clave `12345678` y el correo marcado como confirmado. Hay que cambiarla o borrarla antes de publicar. El rechazo de claves flojas no la toca porque ya existía.

## Correo transaccional

Un solo envío para los dos casos. El remitente es siempre `RESEND_FROM`.

| Caso | Asunto | Vencimiento | Ruta del enlace |
|---|---|---|---|
| Confirmar cuenta | Confirmá tu correo | 24 horas | `/confirmar?token=` |
| Nueva clave | Recuperar el acceso | 30 minutos | `/recuperar?token=` |

Si Resend no está y el servidor no es Vercel, el enlace se muestra en pantalla para poder probar. En Vercel no se muestra: la persona tiene que recibir el correo.

## Creativos

Está en Marketing. Solo el dueño del puesto.

### Qué puede pedir

Solo una pieza que Torre ya habilitó.

- Banner: hay un espacio en `saas_ads` con estado `scheduled` o `active` y fecha de fin de hoy o posterior.
- Push: hay un paquete en `saas_message_packs` activo y con envíos sin usar.

Si no hay ninguno, la pantalla no deja generar.

### Cómo se genera

1. DeepSeek escribe una sola descripción de foto y cuatro textos distintos. Tiempo máximo de espera: 25 segundos. Se llama a `POST https://api.deepseek.com/chat/completions` con el pensamiento apagado.
2. Si el modelo no devuelve al menos dos textos y una descripción de foto, no se sigue y no se cobra.
3. Qwen genera una imagen de `1024*1024`, sin marca de agua. Tiempo máximo: 50 segundos.
4. Recién si la imagen volvió, se descuentan 4 créditos. El descuento es uno solo y no pasa si el saldo no alcanza.
5. Los cuatro textos se guardan apuntando a esa misma foto. El texto no se cobra aparte.
6. Si DeepSeek o Qwen fallan antes del descuento, el saldo no se toca.

La foto se guarda en la base si pesa entre 1 KB y 900 KB. Si es más grande, queda el enlace de Qwen, que vence más o menos a las 24 horas.

Cada texto: título hasta 80 caracteres, cuerpo hasta 180. El pedido del dueño: entre 8 y 400 caracteres.

### Precios

Un crédito no es una foto. Una foto sale 4 créditos.

| Producto | Id | Créditos | Precio | Fotos que alcanza |
|---|---|---|---|---|
| Paquete chico | `prod_creditos_50` | 50 | USD 5,99 | 12 |
| Paquete grande | `prod_creditos_100` | 100 | USD 9,99 | 25 |

Los dos son add-on de una sola vez, no van en el abono. El dueño los contrata como el banner: transferencia con comprobante o a cargo en cuenta, y acepta las dos condiciones. Los créditos entran al saldo del puesto cuando Torre habilita ese pago. Comprar de nuevo suma otro paquete.

Costo de referencia de la API de Qwen Image 3.0, lista de Alibaba al 11 de octubre de 2026, región Singapur: USD 0,03 por imagen de 1K o 2K. El texto de DeepSeek no mueve ese número. Con el paquete de USD 5,99 el puesto paga cerca de USD 0,50 por foto. Con el de USD 9,99, cerca de USD 0,36.

El peso de una transferencia sigue la regla ya existente: dólar oficial por 1,05, redondeado para arriba al próximo múltiplo de 100.

## Sucursales del puesto

La sucursal de Torre sigue siendo el contrato. La operación vive aparte. Cuando el dueño crea una sucursal, y solo si Torre dejó lugar, se genera un juego de libros nuevo. No es otro negocio: el contrato, los usuarios, Creativos, los banners y Mercado al Toque siguen en la casa matriz.

### Cupo

- El plan base cuenta 1. Esa es la matriz.
- Cada línea activa `sucursal-extra` (o de tipo sucursal) suma su cantidad.
- El dueño crea mientras las sucursales activas sean menos que ese cupo.
- Si no hay lugar, no se crea. El alta y la baja del cobro siguen en Torre.
- Desactivar una sucursal desde el puesto no está armado. El lugar no se devuelve solo.

### Qué se genera al crear

Se abre un tenant nuevo, con su `ticket_seq` en cero.

| Dato | Qué pasa |
|---|---|
| Catálogo y precios | Se copian de la matriz. Después cada sucursal edita los suyos |
| Stock | Cero. Un producto cargado después en la matriz no aparece solo en la otra |
| Ventas, caja, pedidos, tickets | No se copian. Quedan en la matriz |
| Clientes | No se copian. Importar trae la ficha y la marca de cuenta corriente, sin saldo |
| Mercado al Toque | Apagado en la sucursal. Publicar esa lista no está incluido |
| Identidad | Arranca con la config de la matriz, sin el canal de Mercado. El nombre es el de la sucursal |

La copia de cada producto queda ligada al de la matriz en `sucursal_producto`. La transferencia usa ese vínculo: sale de la matriz y entra en la copia. Si no hay vínculo, no se transfiere. El movimiento se anota en las dos, tipo ajuste, referencia `transferencia`.

En Torre se anota la sucursal para que figure en el contrato. No se vuelve a calcular el cobro en ese momento: el lugar ya tenía que estar habilitado.

### Cómo se entra

En el tablero, **Entrar** deja al usuario dentro de esa sucursal. A partir de ahí, stock, pedidos, caja y clientes son los de esos libros. Volver a la matriz limpia la sucursal activa.

El dueño siempre puede cambiar. Cajero y vendedor no, salvo que en Usuarios el dueño les ponga **Puede cambiar**. Sin eso quedan en la sucursal donde estén y no ven la otra.

**Todo el negocio** lo ve solo el dueño. Son los últimos 7 días de cada sucursal: ventas, tickets y productos en stock bajo, más la suma. No mezcla la cola ni cierra una caja conjunta.

## Tablas nuevas

| Tabla | Para qué |
|---|---|
| `seguridad_cupo` | Contador compartido de intentos. Clave, cantidad y vencimiento |
| `creativos_saldo` | Créditos del puesto |
| `creativos_pedidos` | Cada pedido: formato, cantidad de textos, créditos cobrados, texto del dueño, estado |
| `creativos_variantes` | Los textos de ese pedido y la foto |
| `sucursales` | Cada sucursal del puesto. `tenant_id` es la casa. `libros_tenant_id` es donde operan stock, caja y pedidos. La matriz apunta los dos al mismo tenant |
| `sucursal_producto` | Producto de la matriz y su copia en la sucursal, para transferir |

En `staff` se agregaron `sucursal_actual_id` y `puede_cambiar`.

Migraciones: `0023_seguridad_cupo.sql`, `0024_creativos.sql`, `0025_creativos_packs.sql`, `0026_creativos_una_foto.sql`, `0027_creativos_precio.sql`, `0028_sucursales_operativas.sql`.

## Qué más quedó en esos días, sin repetir el detalle de pantalla

- Torre Android y API `/api/torre/v1` para ver pendientes y habilitar.
- Compradores de Mercado en la lista de clientes del puesto.
- Catálogo comercial en dólares, con el peso calculado al cobrar.
- Dos aceptaciones: uso de la app, y add-ons o servicios.
- Tablero de Torre con el menú agrupado, y tablero de Mostrador con el slider arriba a la derecha, la mesa en una línea y el stock al 80 % del ancho.
- Sucursales operativas: al crear, libros propios, catálogo copiado y cruce de 7 días en el tablero del dueño.

## Antes de publicar

1. Cargar en Vercel las seis variables obligatorias de la tabla de arriba.
2. Verificar el dominio en Resend y usarlo en `RESEND_FROM`.
3. Crear el widget de Turnstile con el dominio `mostrador.grok.me`.
4. Pegar la clave pública en la app Android y compilar de nuevo.
5. Sacar o cambiar la cuenta de prueba `12345678`.
