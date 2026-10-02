import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/cobro.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';
import 'cobro_controller.dart';
import 'cobro_dialog.dart';
import 'edicion_items_controller.dart';
import 'editar_items_dialog.dart';
import 'ticket_dialog.dart';

/// Filtro de la lista de caja; cada opción mapea al `?estados=` del contrato.
enum CajaFiltro {
  porCobrar('borrador,enviado,en_preparacion,listo', 'Por cobrar'),
  cobrados('cobrado,entregado', 'Cobrados'),
  todos(null, 'Todos');

  const CajaFiltro(this.estados, this.label);

  final String? estados;
  final String label;
}

/// Caja (desktop): pedidos a la izquierda, detalle con cobro a la derecha.
/// Sólo usa las rutas del contrato v1; ningún estado se inventa localmente.
class CajaPane extends ConsumerStatefulWidget {
  const CajaPane({super.key});

  @override
  ConsumerState<CajaPane> createState() => _CajaPaneState();
}

class _CajaPaneState extends ConsumerState<CajaPane> {
  CajaFiltro _filtro = CajaFiltro.porCobrar;
  String? _seleccionado;

  @override
  Widget build(BuildContext context) {
    final pedidos = ref.watch(pedidosCajaProvider(_filtro.estados));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: SegmentedButton<CajaFiltro>(
                  key: const Key('caja_filtro'),
                  segments: [
                    for (final filtro in CajaFiltro.values)
                      ButtonSegment(value: filtro, label: Text(filtro.label)),
                  ],
                  selected: {_filtro},
                  onSelectionChanged: (seleccion) =>
                      setState(() => _filtro = seleccion.first),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('caja_refrescar'),
                tooltip: 'Actualizar pedidos',
                onPressed: pedidos.isRefreshing
                    ? null
                    : () => ref.invalidate(pedidosCajaProvider(_filtro.estados)),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        if (pedidos.isRefreshing)
          const LinearProgressIndicator(key: Key('caja_refrescando')),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(width: 380, child: _lista(context, ref, pedidos)),
              const VerticalDivider(width: 1),
              Expanded(
                child: _seleccionado == null
                    ? const _SinSeleccion()
                    : _CajaDetalle(pedidoId: _seleccionado!),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _lista(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<List<Pedido>> pedidos,
  ) {
    if (pedidos.isLoading && !pedidos.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('caja_cargando')),
      );
    }
    final lista = pedidos.value;
    if (lista == null) {
      final error = pedidos.error;
      return _ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudieron cargar los pedidos.',
        onReintentar: () => ref.invalidate(pedidosCajaProvider(_filtro.estados)),
      );
    }
    if (lista.isEmpty) {
      return const _SinPedidosCaja();
    }
    return ListView.separated(
      key: const Key('caja_lista'),
      itemCount: lista.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final pedido = lista[index];
        return ListTile(
          key: Key('caja_tile_${pedido.id}'),
          selected: pedido.id == _seleccionado,
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text('Nº ${pedido.id}'),
          subtitle: Text('${pedido.clienteNombre} · ${pedido.estado.label}'),
          trailing: Text(
            moneda(pedido.total),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          onTap: () => setState(() => _seleccionado = pedido.id),
        );
      },
    );
  }
}

class _SinSeleccion extends StatelessWidget {
  const _SinSeleccion();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Center(
      key: const Key('caja_sin_seleccion'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.point_of_sale_outlined,
              size: 56, color: tema.colorScheme.outline),
          const SizedBox(height: 12),
          const Text('Elegí un pedido de la lista'),
        ],
      ),
    );
  }
}

class _SinPedidosCaja extends StatelessWidget {
  const _SinPedidosCaja();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Center(
      key: const Key('caja_vacio'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.receipt_long_outlined,
              size: 56, color: tema.colorScheme.outline),
          const SizedBox(height: 12),
          const Text('No hay pedidos con este filtro', textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _CajaDetalle extends ConsumerWidget {
  const _CajaDetalle({required this.pedidoId});

  final String pedidoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final detalle = ref.watch(pedidoDetalleProvider(pedidoId));
    final cobro = ref.watch(cobroControllerProvider(pedidoId));
    ref.listen(edicionItemsControllerProvider(pedidoId), (anterior, siguiente) {
      if (siguiente.exito && anterior?.exito != true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Ítems actualizados.'),
            duration: Duration(seconds: 1),
          ),
        );
      }
    });
    if (detalle.isLoading && !detalle.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('caja_detalle_cargando')),
      );
    }
    final pedido = detalle.value;
    if (pedido == null) {
      final error = detalle.error;
      return _ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudo cargar el pedido.',
        onReintentar: () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
        claveReintentar: const Key('caja_detalle_reintentar'),
      );
    }
    final resultado = cobro.resultado;
    return Column(
      children: [
        if (detalle.isRefreshing)
          const LinearProgressIndicator(key: Key('caja_detalle_refrescando')),
        Expanded(
          child: ListView(
            key: const Key('caja_detalle'),
            children: [
              ListTile(
                title: Text(
                  'Nº ${pedido.id}',
                  key: const Key('caja_detalle_id'),
                ),
                subtitle: Text(
                  'Cliente: ${pedido.clienteNombre}',
                  key: const Key('caja_detalle_cliente'),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      pedido.estado.label,
                      key: const Key('caja_detalle_estado'),
                      style: tema.textTheme.titleMedium,
                    ),
                    IconButton(
                      key: const Key('caja_detalle_refrescar'),
                      tooltip: 'Actualizar pedido',
                      onPressed: detalle.isRefreshing
                          ? null
                          : () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
                      icon: const Icon(Icons.refresh),
                    ),
                  ],
                ),
              ),
              if (cobro.exito && resultado != null)
                _ExitoCobro(resultado: resultado),
              const Divider(height: 1),
              for (final item in pedido.items)
                ListTile(
                  key: Key('caja_item_${item.productoId}'),
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
                  key: const Key('caja_detalle_total'),
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
              if (pedido.nota != null && pedido.nota!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text('Nota: ${pedido.nota}'),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    if (pedido.estado.editable && !cobro.exito)
                      OutlinedButton.icon(
                        key: const Key('caja_editar_items'),
                        onPressed: () => _abrirEdicion(context, ref, pedido),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Editar ítems'),
                      ),
                    if (pedido.estado.cobrable && !cobro.exito)
                      FilledButton.icon(
                        key: const Key('caja_cobrar'),
                        onPressed: () => _abrirCobro(context, ref, pedido),
                        icon: const Icon(Icons.point_of_sale_outlined),
                        label: const Text('Cobrar'),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }

  /// Nuevo intento lógico de cobro: se descarta el estado anterior (y su
  /// `clientUuid`) antes de abrir el diálogo.
  Future<void> _abrirCobro(BuildContext context, WidgetRef ref, Pedido pedido) async {
    ref.invalidate(cobroControllerProvider(pedidoId));
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => CobroDialog(pedido: pedido),
    );
  }

  Future<void> _abrirEdicion(BuildContext context, WidgetRef ref, Pedido pedido) async {
    ref.invalidate(edicionItemsControllerProvider(pedidoId));
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => EditarItemsDialog(pedido: pedido),
    );
  }
}

class _ExitoCobro extends StatelessWidget {
  const _ExitoCobro({required this.resultado});

  final CobroResultado resultado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final estilo = TextStyle(color: tema.colorScheme.onSecondaryContainer);
    return Material(
      key: const Key('caja_cobro_exito'),
      color: tema.colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cobro Nº ${resultado.numero} registrado',
              style: tema.textTheme.titleMedium?.copyWith(color: estilo.color),
            ),
            const SizedBox(height: 4),
            Text(
              'Total: ${moneda(resultado.total)} · Vuelto: ${moneda(resultado.vuelto)}',
              style: estilo,
            ),
            Text('Comprobante: ${resultado.cobroId}', style: estilo),
            if (resultado.ticketId != null) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('caja_ver_ticket'),
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (dialogContext) =>
                      TicketDialog(cobroId: resultado.cobroId),
                ),
                icon: const Icon(Icons.receipt_outlined),
                label: const Text('Ver ticket'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ErrorCaja extends StatelessWidget {
  const _ErrorCaja({
    required this.mensaje,
    required this.onReintentar,
    this.claveReintentar = const Key('caja_reintentar'),
  });

  final String mensaje;
  final VoidCallback onReintentar;
  final Key claveReintentar;

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
            key: claveReintentar,
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
