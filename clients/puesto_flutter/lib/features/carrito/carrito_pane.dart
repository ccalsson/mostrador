import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../models/carrito.dart';
import '../../models/pedido.dart';
import 'carrito_controller.dart';

/// Carrito del vendedor: líneas con cantidades, total y confirmación
/// explícita. Tras crear el pedido muestra la pantalla de resultado.
class CarritoPane extends ConsumerWidget {
  const CarritoPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final carrito = ref.watch(carritoControllerProvider);
    final pedido = carrito.pedido;
    if (pedido != null) return _PedidoCreado(pedido: pedido);
    if (carrito.vacio && carrito.envio != EnvioEstado.enviando) {
      return const _CarritoVacio();
    }
    return _ListaCarrito(carrito: carrito);
  }
}

class _CarritoVacio extends StatelessWidget {
  const _CarritoVacio();

  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('carrito_vacio'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.shopping_cart_outlined,
              size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          const Text('El carrito está vacío'),
          const SizedBox(height: 4),
          Text(
            'Agregá productos desde el catálogo.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _ListaCarrito extends ConsumerWidget {
  const _ListaCarrito({required this.carrito});

  final Carrito carrito;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controlador = ref.read(carritoControllerProvider.notifier);
    final enviando = carrito.envio == EnvioEstado.enviando;
    return Column(
      children: [
        if (enviando) const LinearProgressIndicator(key: Key('carrito_enviando')),
        if (carrito.envio == EnvioEstado.error)
          _ErrorEnvio(mensaje: carrito.errorMensaje, onReintentar: controlador.confirmar),
        Expanded(
          child: ListView.separated(
            key: const Key('carrito_lineas'),
            itemCount: carrito.lineas.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final linea = carrito.lineas[index];
              return ListTile(
                key: Key('carrito_linea_${linea.productoId}'),
                title: Text(linea.nombre),
                subtitle: Text(
                  '${moneda(linea.precio)} / ${linea.unidadLabel}',
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      key: Key('carrito_menos_${linea.productoId}'),
                      visualDensity: VisualDensity.compact,
                      iconSize: 20,
                      tooltip: 'Quitar una unidad',
                      onPressed: enviando
                          ? null
                          : () => controlador.fijarCantidad(
                              linea.productoId, linea.cantidad - 1),
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text(
                      '${linea.cantidad}',
                      key: Key('carrito_cantidad_${linea.productoId}'),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    IconButton(
                      key: Key('carrito_mas_${linea.productoId}'),
                      visualDensity: VisualDensity.compact,
                      iconSize: 20,
                      tooltip: 'Agregar una unidad',
                      onPressed: enviando
                          ? null
                          : () => controlador.fijarCantidad(
                              linea.productoId, linea.cantidad + 1),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                    IconButton(
                      key: Key('carrito_quitar_${linea.productoId}'),
                      visualDensity: VisualDensity.compact,
                      iconSize: 20,
                      tooltip: 'Eliminar del carrito',
                      onPressed: enviando
                          ? null
                          : () => controlador.quitar(linea.productoId),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Total: ${moneda(carrito.total)}',
                  key: const Key('carrito_total'),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              FilledButton.icon(
                key: const Key('carrito_confirmar'),
                onPressed: enviando ? null : () => _confirmar(context, ref),
                icon: const Icon(Icons.check),
                label: const Text('Confirmar pedido'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _confirmar(BuildContext context, WidgetRef ref) async {
    final carrito = ref.read(carritoControllerProvider);
    final aceptado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirmar pedido'),
        content: Text(
          '¿Crear un pedido por ${moneda(carrito.total)}'
          ' con ${carrito.unidades} ${carrito.unidades == 1 ? 'unidad' : 'unidades'}?',
        ),
        actions: [
          TextButton(
            key: const Key('confirmar_cancelar'),
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('confirmar_aceptar'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (aceptado != true) return;
    await ref.read(carritoControllerProvider.notifier).confirmar();
  }
}

class _ErrorEnvio extends StatelessWidget {
  const _ErrorEnvio({required this.mensaje, required this.onReintentar});

  final String? mensaje;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('carrito_error'),
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Text(
                mensaje ?? 'No se pudo crear el pedido.',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
            TextButton(
              key: const Key('carrito_reintentar'),
              onPressed: onReintentar,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PedidoCreado extends ConsumerWidget {
  const _PedidoCreado({required this.pedido});

  final Pedido pedido;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    return ListView(
      key: const Key('pedido_creado'),
      padding: const EdgeInsets.all(24),
      children: [
        Icon(Icons.check_circle_outline, size: 72, color: tema.colorScheme.primary),
        const SizedBox(height: 12),
        Text(
          'Pedido creado',
          textAlign: TextAlign.center,
          style: tema.textTheme.headlineSmall,
        ),
        const SizedBox(height: 16),
        Text(
          'Nº ${pedido.id}',
          key: const Key('pedido_creado_id'),
          textAlign: TextAlign.center,
          style: tema.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          'Estado: ${pedido.estado.label}',
          key: const Key('pedido_creado_estado'),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          'Total: ${moneda(pedido.total)}',
          key: const Key('pedido_creado_total'),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        FilledButton(
          key: const Key('pedido_detalle_abrir'),
          onPressed: () => context.push('/vendedor/pedido/${pedido.id}'),
          child: const Text('Ver detalle'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          key: const Key('pedido_creado_nuevo'),
          onPressed: () => ref.read(carritoControllerProvider.notifier).reiniciar(),
          child: const Text('Nuevo pedido'),
        ),
      ],
    );
  }
}
