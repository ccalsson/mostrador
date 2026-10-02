import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';

/// Pedidos del vendedor autenticado (`GET /api/v1/pedidos?mine=1`),
/// con refresco manual y acceso al detalle.
class PedidosPane extends ConsumerWidget {
  const PedidosPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidos = ref.watch(pedidosMineProvider);
    if (pedidos.isLoading && !pedidos.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('pedidos_cargando')),
      );
    }
    final lista = pedidos.value;
    if (lista == null) {
      final error = pedidos.error;
      return _ErrorPedidos(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudieron cargar los pedidos.',
        onReintentar: () => ref.invalidate(pedidosMineProvider),
      );
    }
    final refrescando = pedidos.isRefreshing;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Mis pedidos',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                key: const Key('pedidos_refrescar'),
                tooltip: 'Actualizar pedidos',
                onPressed:
                    refrescando ? null : () => ref.invalidate(pedidosMineProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (refrescando)
          const LinearProgressIndicator(key: Key('pedidos_refrescando')),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(pedidosMineProvider.future),
            child: lista.isEmpty ? const _SinPedidos() : _ListaPedidos(pedidos: lista),
          ),
        ),
      ],
    );
  }
}

class _ListaPedidos extends StatelessWidget {
  const _ListaPedidos({required this.pedidos});

  final List<Pedido> pedidos;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      key: const Key('pedidos_lista'),
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: pedidos.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final pedido = pedidos[index];
        return ListTile(
          key: Key('pedido_tile_${pedido.id}'),
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text('Nº ${pedido.id}'),
          subtitle: Text(
            '${fechaCorta(pedido.createdAt)} · ${pedido.estado.label}',
          ),
          trailing: Text(
            moneda(pedido.total),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          onTap: () => context.push('/vendedor/pedido/${pedido.id}'),
        );
      },
    );
  }
}

class _SinPedidos extends StatelessWidget {
  const _SinPedidos();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return ListView(
      key: const Key('pedidos_vacio'),
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 120),
      children: [
        Icon(Icons.receipt_long_outlined,
            size: 56, color: tema.colorScheme.outline),
        const SizedBox(height: 12),
        const Text('No tenés pedidos todavía', textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(
          'Los pedidos que confirmes van a aparecer acá.',
          textAlign: TextAlign.center,
          style: tema.textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ErrorPedidos extends StatelessWidget {
  const _ErrorPedidos({required this.mensaje, required this.onReintentar});

  final String mensaje;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_outlined,
              size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: const Key('pedidos_reintentar'),
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
