import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';
import 'entrega_controller.dart';

/// Detalle de un pedido (`GET /api/v1/pedidos/:id`) con refresco y entrega
/// confirmada (`POST /api/v1/pedidos/:id/entregar`).
class PedidoDetalleScreen extends ConsumerWidget {
  const PedidoDetalleScreen({super.key, required this.pedidoId});

  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detalle = ref.watch(pedidoDetalleProvider(pedidoId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del pedido'),
        actions: [
          IconButton(
            key: const Key('pedido_detalle_refrescar'),
            tooltip: 'Actualizar pedido',
            onPressed: detalle.isLoading
                ? null
                : () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _cuerpo(context, ref, detalle),
    );
  }

  Widget _cuerpo(BuildContext context, WidgetRef ref, AsyncValue<Pedido> detalle) {
    if (detalle.isLoading && !detalle.hasValue) {
      return const Center(child: CircularProgressIndicator());
    }
    final pedido = detalle.value;
    if (pedido == null) {
      final error = detalle.error;
      return _ErrorDetalle(
        mensaje: error is ApiException ? error.message : 'No se pudo cargar el pedido.',
        onReintentar: () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
      );
    }
    return Column(
      children: [
        if (detalle.isRefreshing)
          const LinearProgressIndicator(key: Key('pedido_detalle_refrescando')),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(pedidoDetalleProvider(pedidoId).future),
            child: _Detalle(pedido: pedido, pedidoId: pedidoId),
          ),
        ),
      ],
    );
  }
}

class _Detalle extends ConsumerWidget {
  const _Detalle({required this.pedido, required this.pedidoId});

  final Pedido pedido;
  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final entrega = ref.watch(entregaControllerProvider(pedidoId));
    ref.listen(entregaControllerProvider(pedidoId), (anterior, siguiente) {
      if (siguiente.exito && anterior?.exito != true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Pedido entregado.'),
            duration: Duration(seconds: 1),
          ),
        );
      }
    });
    return ListView(
      key: const Key('pedido_detalle'),
      physics: const AlwaysScrollableScrollPhysics(),
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
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Text(
            'Creado: ${fechaCorta(pedido.createdAt)}',
            style: tema.textTheme.bodySmall,
          ),
        ),
        if (entrega.fase == EntregaFase.error) _ErrorEntrega(mensaje: entrega.errorMensaje),
        if (pedido.estado == PedidoEstado.cobrado)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: FilledButton.icon(
              key: const Key('pedido_entregar'),
              onPressed: (entrega.enviando || entrega.exito)
                  ? null
                  : () => _confirmar(context, ref),
              icon: entrega.enviando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.local_shipping_outlined),
              label: Text(entrega.enviando ? 'Entregando…' : 'Entregar pedido'),
            ),
          ),
        const SizedBox(height: 24),
      ],
    );
  }

  Future<void> _confirmar(BuildContext context, WidgetRef ref) async {
    final aceptado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => const _DialogoEntrega(),
    );
    if (aceptado != true) return;
    await ref.read(entregaControllerProvider(pedidoId).notifier).entregar();
  }
}

/// Diálogo con guard local: un doble tap no dispara dos `pop` (el segundo
/// cerraría también el detalle).
class _DialogoEntrega extends StatefulWidget {
  const _DialogoEntrega();

  @override
  State<_DialogoEntrega> createState() => _DialogoEntregaState();
}

class _DialogoEntregaState extends State<_DialogoEntrega> {
  bool _cerrado = false;

  void _responder(bool valor) {
    if (_cerrado) return;
    _cerrado = true;
    Navigator.pop(context, valor);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirmar entrega'),
      content: const Text('¿Confirmar entrega del pedido?'),
      actions: [
        TextButton(
          key: const Key('entrega_cancelar'),
          onPressed: () => _responder(false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('entrega_confirmar'),
          onPressed: () => _responder(true),
          child: const Text('Confirmar entrega'),
        ),
      ],
    );
  }
}

class _ErrorEntrega extends StatelessWidget {
  const _ErrorEntrega({this.mensaje});

  final String? mensaje;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('entrega_error'),
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(
          mensaje ?? 'No se pudo entregar el pedido.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
        ),
      ),
    );
  }
}

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
