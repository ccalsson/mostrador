import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';
import 'error_caja.dart';

/// Intervalo de sondeo para las listas de entrega.
const Duration kSondeoEntrega = Duration(seconds: 15);

/// Provider de pedidos por entregar (cobrado).
final _porEntregarProvider = FutureProvider<List<Pedido>>((ref) async {
  return ref.watch(pedidosServiceProvider).listar(estados: 'cobrado');
});

/// Provider de pedidos entregados.
final _entregadosProvider = FutureProvider<List<Pedido>>((ref) async {
  return ref.watch(pedidosServiceProvider).listar(estados: 'entregado');
});

/// Panel de entrega: listas de pedidos "Por entregar" (cobrados) y "Entregados".
/// Equivale a la sección `Entrega` de la web (caja.tsx:284-316).
///
/// Usa polling con [kSondeoEntrega] para refrescar las listas. Pasar
/// `intervalo: null` congela el sondeo (widget tests).
class EntregaPane extends ConsumerStatefulWidget {
  const EntregaPane({super.key, this.intervalo = kSondeoEntrega});

  final Duration? intervalo;

  @override
  ConsumerState<EntregaPane> createState() => _EntregaPaneState();
}

class _EntregaPaneState extends ConsumerState<EntregaPane> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.intervalo != null) {
      _timer = Timer.periodic(widget.intervalo!, (_) {
        if (!mounted) return;
        ref.invalidate(_porEntregarProvider);
        ref.invalidate(_entregadosProvider);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _refrescar() {
    ref.invalidate(_porEntregarProvider);
    ref.invalidate(_entregadosProvider);
  }

  @override
  Widget build(BuildContext context) {
    final porEntregar = ref.watch(_porEntregarProvider);
    final entregados = ref.watch(_entregadosProvider);
    final tema = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Por entregar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Text(
                'Por entregar',
                style: tema.textTheme.titleSmall?.copyWith(
                  color: tema.colorScheme.error,
                ),
              ),
              const Spacer(),
              IconButton(
                key: const Key('entrega_refrescar'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh, size: 18),
                onPressed: _refrescar,
              ),
            ],
          ),
        ),
        Expanded(
          flex: 3,
          child: porEntregar.when(
            loading: () =>
                const Center(child: CircularProgressIndicator(key: Key('entrega_cargando'))),
            error: (e, _) => ErrorCaja(
              mensaje: e is ApiException ? e.message : 'Error al cargar.',
              onReintentar: () => ref.invalidate(_porEntregarProvider),
              claveReintentar: const Key('entrega_reintentar'),
            ),
            data: (pedidos) => pedidos.isEmpty
                ? const Center(
                    key: Key('entrega_sin_pendientes'),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('Nada pendiente de entrega.'),
                    ),
                  )
                : ListView.builder(
                    key: const Key('entrega_por_entregar'),
                    itemCount: pedidos.length,
                    itemBuilder: (context, index) {
                      final p = pedidos[index];
                      return _TileEntrega(
                        pedido: p,
                        tipo: _TipoEntrega.pendiente,
                        onTap: () => _mostrarDetalle(context, ref, p),
                      );
                    },
                  ),
          ),
        ),
        const Divider(height: 1),
        // Entregados
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Text(
            'Entregados',
            style: tema.textTheme.titleSmall?.copyWith(
              color: tema.colorScheme.primary,
            ),
          ),
        ),
        Expanded(
          flex: 2,
          child: entregados.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorCaja(
              mensaje: e is ApiException ? e.message : 'Error al cargar.',
              onReintentar: () => ref.invalidate(_entregadosProvider),
            ),
            data: (pedidos) => pedidos.isEmpty
                ? const Center(
                    key: Key('entrega_sin_entregados'),
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('Todavía no hay entregas.'),
                    ),
                  )
                : ListView.builder(
                    key: const Key('entrega_entregados'),
                    itemCount: pedidos.length,
                    itemBuilder: (context, index) {
                      final p = pedidos[index];
                      return _TileEntrega(
                        pedido: p,
                        tipo: _TipoEntrega.entregado,
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }

  Future<void> _mostrarDetalle(
    BuildContext context,
    WidgetRef ref,
    Pedido pedido,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => _EntregaOverlay(
        pedido: pedido,
        onEntregado: _refrescar,
      ),
    );
  }
}

enum _TipoEntrega { pendiente, entregado }

class _TileEntrega extends StatelessWidget {
  const _TileEntrega({required this.pedido, required this.tipo, this.onTap});

  final Pedido pedido;
  final _TipoEntrega tipo;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final esPendiente = tipo == _TipoEntrega.pendiente;
    return ListTile(
      key: Key('entrega_tile_${pedido.id}'),
      leading: Icon(
        esPendiente ? Icons.pending_outlined : Icons.check_circle_outline,
        color: esPendiente ? tema.colorScheme.error : tema.colorScheme.primary,
        size: 20,
      ),
      title: Text(
        pedido.clienteNombre,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        esPendiente
            ? 'Falta entregar · ${moneda(pedido.total)}'
            : 'Entregado · ${moneda(pedido.total)}',
        style: tema.textTheme.bodySmall?.copyWith(
          color:
              esPendiente ? tema.colorScheme.error : tema.colorScheme.primary,
        ),
      ),
      trailing: esPendiente
          ? const Icon(Icons.chevron_right)
          : Text(
              fechaCorta(pedido.updatedAt),
              style: tema.textTheme.bodySmall,
            ),
      onTap: onTap,
    );
  }
}

/// Overlay con el detalle de un pedido por entregar: muestra los ítems y
/// permite marcar como entregado.
class _EntregaOverlay extends ConsumerStatefulWidget {
  const _EntregaOverlay({required this.pedido, required this.onEntregado});

  final Pedido pedido;
  final VoidCallback onEntregado;

  @override
  ConsumerState<_EntregaOverlay> createState() => _EntregaOverlayState();
}

class _EntregaOverlayState extends ConsumerState<_EntregaOverlay> {
  bool _entregando = false;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final pedido = widget.pedido;
    return Dialog(
      key: const Key('entrega_overlay'),
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 500),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(height: 2, color: tema.colorScheme.error),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Pedido Nº ${pedido.id}',
                          style: tema.textTheme.titleMedium,
                        ),
                        Text(
                          pedido.clienteNombre,
                          style: tema.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    key: const Key('entrega_overlay_cerrar'),
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final item in pedido.items)
                    ListTile(
                      key: Key('entrega_item_${item.productoId}'),
                      dense: true,
                      title: Text(item.nombre),
                      subtitle: Text(
                        '${cantidadNum(item.cantidad)} ${item.unidadLabel}',
                      ),
                      trailing: Text(
                        moneda(item.subtotal),
                        style: tema.textTheme.bodySmall,
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Total: ${moneda(pedido.total)}',
                    style: tema.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    key: const Key('entrega_marcar_entregado'),
                    onPressed: _entregando ? null : _marcarEntregado,
                    icon: _entregando
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: Text(
                      _entregando ? 'Entregando...' : 'Marcar entregado',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _marcarEntregado() async {
    setState(() => _entregando = true);
    try {
      await ref.read(pedidosServiceProvider).entregar(widget.pedido.id);
      if (!mounted) return;
      widget.onEntregado();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pedido marcado como entregado.')),
      );
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo marcar como entregado.')),
      );
    } finally {
      if (mounted) setState(() => _entregando = false);
    }
  }
}
