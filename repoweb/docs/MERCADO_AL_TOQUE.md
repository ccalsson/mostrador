# Mercado al Toque

Canal del comprador y del cargador. Mostrador sigue siendo el sistema del puesto.

## Qué se reutiliza

- Usuarios y claves de Better Auth (`user` y `account`).
- Google por el mismo broker (`grok-google`). No hay otro login.
- Precio, stock y reserva de `reservarLineas` / `soltarReserva`.
- Pedido e ítems en `pedidos` y `pedido_items`.
- El estado `listo` del puesto es el pedido preparado. No se creó otro estado.

## Qué no se mezcló

El comprador no es un `clientes` del puesto ni personal. `quienSoy` y `ensureStaffForUser` no lo convierten en dueño.

El cargador no cambia el estado interno del pedido. El retiro y la entrega viven en el recorrido. En pantalla se llama cargador.

## Fotos

El DNI, la cédula y la selfie quedan en `mercado_archivos`. La API devuelve solo `documentoRef` y `selfieRef`. Cargarlas deja el estado en `documentacion_cargada`, no en verificada.

## Para que un puesto aparezca

En Productos, el dueño activa "Este puesto aparece en Mercado al Toque" y, en cada producto, "Publicado en Mercado al Toque". Si no, el catálogo online queda vacío a propósito.
