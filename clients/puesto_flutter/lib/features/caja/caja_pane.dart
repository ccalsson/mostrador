import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../models/cobro.dart';
import '../../models/pedido.dart';
import '../../services/anulaciones_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/pedidos_service.dart';
import '../pedidos/cola_pedidos.dart';
import 'anulacion_dialog.dart';
import 'caja_estado_pane.dart';
import 'cobro_controller.dart';
import 'cobro_dialog.dart';
import 'edicion_items_controller.dart';
import 'editar_items_dialog.dart';
import 'egresos_pane.dart';
import 'error_caja.dart';
import 'ticket_dialog.dart';

/// Vistas del área Caja: pedidos (cobro), estado del turno y egresos.
enum CajaVista {
  pedidos('Pedidos'),
  estado('Estado de caja'),
  egresos('Egresos');

  const CajaVista(this.label);

  final String label;
}

/// A partir de este ancho la ficha queda al lado de la lista, como en la web.
/// En pantallas angostas se abre en un diálogo.
const _quiebreFicha = 1024.0;

/// Ancho del rail de la ficha de caja.
const _anchoFicha = 420.0;

/// Caja (desktop): tablero de cola a la izquierda y ficha con el cobro a la
/// derecha. Sólo usa las rutas del contrato v1; ningún estado ni valor se
/// inventa localmente.
class CajaPane extends ConsumerStatefulWidget {
  const CajaPane({super.key, this.intervalo = kSondeoCola});

  /// `null` congela el sondeo del tablero, como en los widget tests.
  final Duration? intervalo;

  @override
  ConsumerState<CajaPane> createState() => _CajaPaneState();
}

class _CajaPaneState extends ConsumerState<CajaPane> {
  CajaVista _vista = CajaVista.pedidos;
  String? _seleccionado;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              SegmentedButton<CajaVista>(
                key: const Key('caja_vista'),
                segments: [
                  for (final vista in CajaVista.values)
                    ButtonSegment(value: vista, label: Text(vista.label)),
                ],
                selected: {_vista},
                onSelectionChanged: (seleccion) =>
                    setState(() => _vista = seleccion.first),
              ),
            ],
          ),
        ),
        Expanded(
          child: switch (_vista) {
            CajaVista.pedidos => _vistaPedidos(context, ref),
            CajaVista.estado => const CajaEstadoPane(),
            CajaVista.egresos => const EgresosPane(),
          },
        ),
      ],
    );
  }

  Widget _vistaPedidos(BuildContext context, WidgetRef ref) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;
        final listado = ColaPedidos(
          contexto: ColaContexto.caja,
          puedeFiltrarPropios: false,
          pedidoIdActivo: _seleccionado,
          intervalo: widget.intervalo,
          onSeleccionar: (pedido) =>
              _seleccionarPedido(pedido.id, enRail: enRail),
        );
        if (!enRail) return listado;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: listado),
            const VerticalDivider(width: 1),
            SizedBox(
              width: _anchoFicha,
              child: _seleccionado == null
                  ? const _SinSeleccion()
                  : _TarjetaFicha(
                      child: _CajaDetalle(
                        pedidoId: _seleccionado!,
                        onEstadoActualizado: _refrescarCola,
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  /// Toda mutación de un pedido relee las cuatro secciones desde el backend:
  /// el tablero no hace mutación optimista.
  void _refrescarCola() => ref.invalidate(pedidosColaProvider);

  void _seleccionarPedido(String id, {required bool enRail}) {
    setState(() => _seleccionado = id);
    if (!enRail) _abrirFicha(id);
  }

  Future<void> _abrirFicha(String pedidoId) async {
    await showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480, maxHeight: 640),
          child: _TarjetaFicha(
            child: _CajaDetalle(
              pedidoId: pedidoId,
              onEstadoActualizado: _refrescarCola,
              onCerrar: () {
                if (dialogo.mounted) Navigator.of(dialogo).pop();
              },
            ),
          ),
        ),
      ),
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
          Icon(
            Icons.point_of_sale_outlined,
            size: 56,
            color: tema.colorScheme.outline,
          ),
          const SizedBox(height: 12),
          const Text('Elegí un pedido de la lista.'),
        ],
      ),
    );
  }
}

class _CajaDetalle extends ConsumerStatefulWidget {
  const _CajaDetalle({
    required this.pedidoId,
    required this.onEstadoActualizado,
    this.onCerrar,
  });

  final String pedidoId;
  final VoidCallback onEstadoActualizado;
  final VoidCallback? onCerrar;

  @override
  ConsumerState<_CajaDetalle> createState() => _CajaDetalleState();
}

class _CajaDetalleState extends ConsumerState<_CajaDetalle> {
  bool _anulando = false;
  bool _actualizandoEstado = false;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final detalle = ref.watch(pedidoDetalleProvider(widget.pedidoId));
    final cobro = ref.watch(cobroControllerProvider(widget.pedidoId));
    ref.listen(edicionItemsControllerProvider(widget.pedidoId), (
      anterior,
      siguiente,
    ) {
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
      return ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudo cargar el pedido.',
        onReintentar: () =>
            ref.invalidate(pedidoDetalleProvider(widget.pedidoId)),
        claveReintentar: const Key('caja_detalle_reintentar'),
      );
    }
    final resultado = cobro.resultado;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (detalle.isRefreshing)
          const LinearProgressIndicator(key: Key('caja_detalle_refrescando')),
        Flexible(
          child: ListView(
            key: const Key('caja_detalle'),
            shrinkWrap: true,
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
                          : () => ref.invalidate(
                              pedidoDetalleProvider(widget.pedidoId),
                            ),
                      icon: const Icon(Icons.refresh),
                    ),
                    if (widget.onCerrar != null)
                      IconButton(
                        key: const Key('caja_detalle_cerrar'),
                        tooltip: 'Cerrar',
                        onPressed: widget.onCerrar,
                        icon: const Icon(Icons.close),
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
                        onPressed: () => _abrirEdicion(context, pedido),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Editar ítems'),
                      ),
                    if (pedido.estado == PedidoEstado.enPreparacion)
                      OutlinedButton.icon(
                        key: const Key('caja_marcar_listo'),
                        onPressed: _actualizandoEstado ? null : _marcarListo,
                        icon: _actualizandoEstado
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.task_alt_outlined),
                        label: Text(
                          _actualizandoEstado ? 'Guardando…' : 'Marcar listo',
                        ),
                      ),
                    if (pedido.estado.cobrable && !cobro.exito)
                      FilledButton.icon(
                        key: const Key('caja_cobrar'),
                        onPressed: () => _abrirCobro(context, pedido),
                        icon: const Icon(Icons.point_of_sale_outlined),
                        label: const Text('Cobrar'),
                      ),
                    if (pedido.estado != PedidoEstado.cobrado &&
                        pedido.estado != PedidoEstado.anulado &&
                        pedido.estado != PedidoEstado.entregado)
                      OutlinedButton.icon(
                        key: const Key('caja_anular_pedido'),
                        onPressed: _anulando ? null : _anularPedido,
                        icon: _anulando
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.cancel_outlined),
                        label: Text(_anulando ? 'Anulando…' : 'Anular pedido'),
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

  Future<void> _marcarListo() async {
    setState(() => _actualizandoEstado = true);
    try {
      await ref
          .read(pedidosServiceProvider)
          .actualizarEstado(widget.pedidoId, PedidoEstado.listo);
      if (!mounted) return;
      ref.invalidate(pedidoDetalleProvider(widget.pedidoId));
      widget.onEstadoActualizado();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pedido marcado como listo.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo actualizar el estado.')),
      );
    } finally {
      if (mounted) setState(() => _actualizandoEstado = false);
    }
  }

  /// Nuevo intento lógico de cobro: se descarta el estado anterior (y su
  /// `clientUuid`) antes de abrir el diálogo.
  Future<void> _abrirCobro(BuildContext context, Pedido pedido) async {
    ref.invalidate(cobroControllerProvider(widget.pedidoId));
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => CobroDialog(pedido: pedido),
    );
  }

  Future<void> _abrirEdicion(BuildContext context, Pedido pedido) async {
    ref.invalidate(edicionItemsControllerProvider(widget.pedidoId));
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => EditarItemsDialog(pedido: pedido),
    );
  }

  Future<void> _anularPedido() async {
    final motivo = await pedirMotivoAnulacion(
      context,
      titulo: 'Anular pedido',
      descripcion: 'Se liberarán las reservas de este pedido. Esta acción no se puede deshacer.',
      confirmar: 'Anular pedido',
    );
    if (motivo == null || !mounted) return;
    setState(() => _anulando = true);
    try {
      await ref
          .read(anulacionesServiceProvider)
          .pedido(widget.pedidoId, motivo: motivo);
      if (!mounted) return;
      ref.invalidate(pedidoDetalleProvider(widget.pedidoId));
      widget.onEstadoActualizado();
      ref.invalidate(catalogoProvider);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Pedido anulado.')));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo anular el pedido.')),
        );
      }
    } finally {
      if (mounted) setState(() => _anulando = false);
    }
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

// ---------------------------------------------------------------------------
// Borde superior naranja y cuerpo liso (patrón ficha web)
// ---------------------------------------------------------------------------

class _TarjetaFicha extends StatelessWidget {
  const _TarjetaFicha({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 2, color: tokens.naranja),
          Flexible(child: child),
        ],
      ),
    );
  }
}
