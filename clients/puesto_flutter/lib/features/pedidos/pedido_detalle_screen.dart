import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';

/// Detalle de un pedido (`GET /api/v1/pedidos/:id`).
class PedidoDetalleScreen extends ConsumerWidget {
  const PedidoDetalleScreen({super.key, required this.pedidoId});

  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detalle = ref.watch(pedidoDetalleProvider(pedidoId));
    return Scaffold(
      appBar: AppBar(title: const Text('Detalle del pedido')),
      body: detalle.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorDetalle(
          mensaje: error is ApiException
              ? error.message
              : 'No se pudo cargar el pedido.',
          onReintentar: () =>
              ref.invalidate(pedidoDetalleProvider(pedidoId)),
        ),
        data: (pedido) => _Detalle(pedido: pedido),
      ),
    );
  }
}

class _Detalle extends StatelessWidget {
  const _Detalle({required this.pedido});

  final Pedido pedido;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return ListView(
      key: const Key('pedido_detalle'),
      children: [
        ListTile(
          title: Text(
            'Nº ${pedido.id}',
            key: const Key('pedido_detalle_id'),
          ),
          subtitle: Text('Cliente: ${pedido.clienteNombre}'),
          trailing: Text(
            pedido.estado.label,
            key: const Key('pedido_detalle_estado'),
            style: tema.textTheme.titleMedium,
          ),
        ),
        if (pedido.vendedorNombre != null)
          ListTile(
            dense: true,
            leading: const Icon(Icons.person_outline),
            title: Text('Vendedor: ${pedido.vendedorNombre}'),
          ),
        const Divider(height: 1),
        for (final item in pedido.items)
          ListTile(
            key: Key('pedido_item_${item.productoId}'),
            title: Text(item.nombre),
            subtitle: Text(
              '${cantidadNum(item.cantidad)} × ${moneda(item.precioUnitario)}'
              ' / ${item.unidadLabel}',
            ),
            trailing: Text(moneda(item.subtotal)),
          ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text(
            'Total: ${moneda(pedido.total)}',
            key: const Key('pedido_detalle_total'),
            style: tema.textTheme.titleLarge,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          child: Text(
            'Creado: ${_fechaCorta(pedido.createdAt)}',
            style: tema.textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

/// Las fechas llegan como texto de Postgres (`2026-10-01 18:04:05.123+00`).
String _fechaCorta(String valor) =>
    valor.length >= 16 ? valor.substring(0, 16) : valor;

class _ErrorDetalle extends StatelessWidget {
  const _ErrorDetalle({required this.mensaje, required this.onReintentar});

  final String mensaje;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: const Key('pedido_detalle_reintentar'),
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
