import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../models/staff_session.dart';
import '../../services/pedidos_service.dart';
import '../caja/editar_items_dialog.dart';
import '../caja/edicion_items_controller.dart';
import '../carrito/carrito_controller.dart';
import 'checklist_pane.dart';
import 'entrega_controller.dart';
import 'entrega_lista_dialog.dart';
import 'pedido_mensajes_pane.dart';

/// Detalle de un pedido (`GET /api/v1/pedidos/:id`) con tres pestanas:
/// **Detalle** (info del pedido, items, entrega), **Checklist** (verificacion
/// de items antes de entregar) y **Mensajes** (chat con el cliente).
class PedidoDetalleScreen extends ConsumerWidget {
  const PedidoDetalleScreen({super.key, required this.pedidoId});

  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detalle = ref.watch(pedidoDetalleProvider(pedidoId));
    return DefaultTabController(
      length: 3,
      child: Scaffold(
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
          bottom: TabBar(
            key: const Key('pedido_detalle_tabs'),
            tabs: const [
              Tab(key: Key('pedido_tab_detalle'), text: 'Detalle'),
              Tab(key: Key('pedido_tab_checklist'), text: 'Checklist'),
              Tab(key: Key('pedido_tab_mensajes'), text: 'Mensajes'),
            ],
          ),
        ),
        body: _cuerpo(context, ref, detalle),
      ),
    );
  }

  Widget _cuerpo(
      BuildContext context, WidgetRef ref, AsyncValue<Pedido> detalle) {
    if (detalle.isLoading && !detalle.hasValue) {
      return const Center(child: CircularProgressIndicator());
    }
    final pedido = detalle.value;
    if (pedido == null) {
      final error = detalle.error;
      return _ErrorDetalle(
        mensaje:
            error is ApiException ? error.message : 'No se pudo cargar el pedido.',
        onReintentar: () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
      );
    }
    return TabBarView(
      children: [
        // Tab 1: Detalle
        _DetalleTab(detalle: detalle, pedido: pedido, pedidoId: pedidoId),
        // Tab 2: Checklist
        ChecklistPane(
          key: Key('checklist_pane_$pedidoId'),
          pedidoId: pedidoId,
        ),
        // Tab 3: Mensajes
        PedidoMensajesPane(
          key: Key('pedido_mensajes_pane_$pedidoId'),
          pedidoId: pedidoId,
        ),
      ],
    );
  }
}

class _DetalleTab extends ConsumerWidget {
  const _DetalleTab({
    required this.detalle,
    required this.pedido,
    required this.pedidoId,
  });

  final AsyncValue<Pedido> detalle;
  final Pedido pedido;
  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
    final sesion = ref.watch(authControllerProvider).sesion;
    final puedeEditar = _puedeEditar(pedido, sesion);
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
        if (puedeEditar)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: OutlinedButton.icon(
              key: const Key('pedido_editar_items'),
              onPressed: () => _abrirEdicion(context, ref, pedido),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Editar ítems'),
            ),
          ),
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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: OutlinedButton.icon(
            key: const Key('pedido_duplicar'),
            onPressed: () => _duplicar(context, ref, pedido),
            icon: const Icon(Icons.copy_outlined),
            label: const Text('Duplicar pedido'),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Future<void> _confirmar(BuildContext context, WidgetRef ref) async {
    final resultado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => EntregaListaDialog(pedido: pedido),
    );
    if (resultado != true) return;
    // El EntregaListaDialog ya disparó la entrega y mostró el snackbar de éxito.
  }

  /// Carga los ítems de este pedido en el carrito actual para duplicarlo.
  void _duplicar(BuildContext context, WidgetRef ref, Pedido pedido) {
    final carrito = ref.read(carritoControllerProvider.notifier);
    carrito.reiniciar();
    for (final item in pedido.items) {
      carrito.agregarDesdeDuplicado(
        productoId: item.productoId,
        nombre: item.nombre,
        unidadLabel: item.unidadLabel,
        precio: item.precioUnitario,
        cantidad: item.cantidad.toInt(),
      );
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pedido duplicado en el carrito'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _abrirEdicion(
    BuildContext context,
    WidgetRef ref,
    Pedido pedido,
  ) async {
    ref.invalidate(edicionItemsControllerProvider(pedidoId));
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => EditarItemsDialog(pedido: pedido),
    );
  }
}

/// Dueño y cajero editan cualquier pedido de la cola; el vendedor sólo los
/// suyos. Nadie edita un pedido ya cobrado o anulado, y un entregado ya pasó
/// por caja: el endpoint lo admitiría, la UI no lo ofrece.
bool _puedeEditar(Pedido pedido, StaffSession? sesion) {
  if (!pedido.estado.editable ||
      pedido.estado == PedidoEstado.entregado ||
      sesion == null) {
    return false;
  }
  final staff = sesion.staff;
  return staff.rol != Rol.vendedor || pedido.vendedorId == staff.id;
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
