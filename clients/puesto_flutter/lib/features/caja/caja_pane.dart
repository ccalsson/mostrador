import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
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
import 'egresos_pane.dart';
import 'entrega_pane.dart';
import 'error_caja.dart';
import 'ticket_dialog.dart';
import 'venta_directa_dialog.dart';

/// Vistas del área Caja: pedidos (cobro), estado del turno, entregas y egresos.
enum CajaVista {
  pedidos('Pedidos'),
  estado('Estado de caja'),
  entregas('Entregas'),
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
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
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
                const SizedBox(width: 16),
                FilledButton.tonalIcon(
                  key: const Key('caja_venta_directa'),
                  onPressed: _abrirVentaDirecta,
                  icon: const Icon(Icons.add_shopping_cart, size: 18),
                  label: const Text('Venta directa'),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: switch (_vista) {
            CajaVista.pedidos => _vistaPedidos(context, ref),
            CajaVista.estado => const CajaEstadoPane(),
            CajaVista.entregas => const EntregaPane(),
            CajaVista.egresos => const EgresosPane(),
          },
        ),
      ],
    );
  }

  /// Abre el diálogo de venta directa; tras cobrar muestra el ticket
  /// automáticamente (gap 6: overlay post-cobro).
  Future<void> _abrirVentaDirecta() async {
    final resultado = await showDialog<CobroResultado>(
      context: context,
      builder: (dialogContext) => const VentaDirectaDialog(),
    );
    if (resultado == null || !mounted) return;
    _refrescarCola();
    // Overlay post-cobro: mostrar ticket automáticamente tras venta directa.
    if (resultado.ticketId != null) {
      _mostrarTicketPostCobro(resultado.cobroId);
    }
  }

  /// Muestra el TicketDialog automáticamente tras un cobro exitoso.
  void _mostrarTicketPostCobro(String cobroId) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => TicketDialog(cobroId: cobroId),
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

  // --- Gap 7: edición inline de ítems ---
  bool _editandoItems = false;
  List<_ItemEdit> _itemsEdit = [];
  String? _agregarProdId;

  // --- Gap 3: comprobante de transferencia ---
  Uint8List? _comprobanteBytes;
  bool _cargandoComprobante = false;
  String? _comprobanteError;

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
              // --- Gap 3: comprobante de transferencia ---
              if (pedido.formaPago == 'transferencia' &&
                  pedido.comprobanteNombre != null &&
                  pedido.comprobanteNombre!.isNotEmpty)
                _ComprobanteTransferencia(
                  pedidoId: pedido.id,
                  comprobanteNombre: pedido.comprobanteNombre!,
                  bytes: _comprobanteBytes,
                  cargando: _cargandoComprobante,
                  error: _comprobanteError,
                  onCargar: () => _cargarComprobante(pedido.id),
                ),
              // --- Gap 7: ítems inline editables ---
              if (_editandoItems) ...[
                for (var i = 0; i < _itemsEdit.length; i++)
                  _FilaItemEditable(
                    key: Key('caja_edit_item_${_itemsEdit[i].productoId}'),
                    item: _itemsEdit[i],
                    index: i,
                    onIncrementar: () => setState(
                      () => _itemsEdit[i].cantidad++,
                    ),
                    onDecrementar: () => setState(() {
                      if (_itemsEdit[i].cantidad > 1) {
                        _itemsEdit[i].cantidad--;
                      } else {
                        _itemsEdit.removeAt(i);
                      }
                    }),
                    onEliminar: () =>
                        setState(() => _itemsEdit.removeAt(i)),
                  ),
                if (_itemsEdit.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Agregá al menos un producto.'),
                  ),
                // Agregar producto
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: _SelectorAgregarProducto(
                    seleccionado: _agregarProdId,
                    excluidos: {for (final it in _itemsEdit) it.productoId},
                    onChanged: (id) => setState(() => _agregarProdId = id),
                    onAgregar: () {
                      final id = _agregarProdId;
                      if (id == null) return;
                      final catalogo =
                          ref.read(catalogoProvider).value;
                      final prod = catalogo?.productos
                          .where((p) => p.id == id)
                          .firstOrNull;
                      if (prod == null) return;
                      setState(() {
                        _itemsEdit.add(_ItemEdit(
                          productoId: prod.id,
                          nombre: prod.nombre,
                          precio: prod.precio,
                          unidadLabel: prod.unidadLabel,
                          cantidad: 1,
                        ));
                        _agregarProdId = null;
                      });
                    },
                  ),
                ),
                // Total estimado + botones guardar/cancelar
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Estimado: ${moneda(_totalEstimado)}',
                        key: const Key('caja_edit_total_estimado'),
                        style: tema.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          TextButton(
                            key: const Key('caja_edit_items_cancelar'),
                            onPressed: () =>
                                setState(() => _editandoItems = false),
                            child: const Text('Cancelar'),
                          ),
                          const Spacer(),
                          FilledButton(
                            key: const Key('caja_edit_items_guardar'),
                            onPressed: _itemsEdit.isEmpty
                                ? null
                                : () => _guardarItemsInline(pedido.id),
                            child: const Text('Guardar'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ] else ...[
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
              ],
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
                    if (pedido.estado.editable &&
                        !cobro.exito &&
                        !_editandoItems)
                      OutlinedButton.icon(
                        key: const Key('caja_editar_items'),
                        onPressed: () => _iniciarEdicionInline(pedido),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Editar ítems'),
                      ),
                    // --- Gap 5: botón "Empezar a preparar" ---
                    if (pedido.estado == PedidoEstado.enviado)
                      OutlinedButton.icon(
                        key: const Key('caja_empezar_preparar'),
                        onPressed: _actualizandoEstado
                            ? null
                            : () => _cambiarEstado(PedidoEstado.enPreparacion),
                        icon: _actualizandoEstado
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.restaurant_outlined),
                        label: Text(
                          _actualizandoEstado
                              ? 'Guardando…'
                              : 'Empezar a preparar',
                        ),
                      ),
                    if (pedido.estado == PedidoEstado.enPreparacion)
                      OutlinedButton.icon(
                        key: const Key('caja_marcar_listo'),
                        onPressed: _actualizandoEstado
                            ? null
                            : () => _cambiarEstado(PedidoEstado.listo),
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

  /// Total estimado durante la edición inline.
  double get _totalEstimado => redondear2(
        _itemsEdit.fold(0, (acc, it) => acc + it.subtotal),
      );

  /// Gap 5: transición de estado genérica (enviado→en_preparacion,
  /// en_preparacion→listo). Reemplaza al antiguo _marcarListo.
  Future<void> _cambiarEstado(PedidoEstado nuevo) async {
    setState(() => _actualizandoEstado = true);
    try {
      await ref
          .read(pedidosServiceProvider)
          .actualizarEstado(widget.pedidoId, nuevo);
      if (!mounted) return;
      ref.invalidate(pedidoDetalleProvider(widget.pedidoId));
      widget.onEstadoActualizado();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pedido en "${nuevo.label}".')),
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

  /// Gap 7: inicia la edición inline copiando los ítems actuales.
  void _iniciarEdicionInline(Pedido pedido) {
    setState(() {
      _editandoItems = true;
      _itemsEdit = [
        for (final item in pedido.items)
          _ItemEdit(
            productoId: item.productoId,
            nombre: item.nombre,
            precio: item.precioUnitario,
            unidadLabel: item.unidadLabel,
            cantidad: item.cantidad,
          ),
      ];
      _agregarProdId = null;
    });
  }

  /// Gap 7: guarda los ítems editados inline vía el controller existente.
  Future<void> _guardarItemsInline(String pedidoId) async {
    ref.invalidate(edicionItemsControllerProvider(pedidoId));
    await ref
        .read(edicionItemsControllerProvider(pedidoId).notifier)
        .guardar([
      for (final item in _itemsEdit)
        (productoId: item.productoId, cantidad: item.cantidad),
    ]);
    if (!mounted) return;
    setState(() => _editandoItems = false);
    ref.invalidate(pedidoDetalleProvider(pedidoId));
    widget.onEstadoActualizado();
  }

  /// Gap 3: carga los bytes del comprobante de transferencia.
  Future<void> _cargarComprobante(String pedidoId) async {
    setState(() {
      _cargandoComprobante = true;
      _comprobanteError = null;
    });
    try {
      final bytes =
          await ref.read(pedidosServiceProvider).comprobante(pedidoId);
      if (!mounted) return;
      setState(() {
        _comprobanteBytes = bytes;
        _cargandoComprobante = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _comprobanteError =
            e is ApiException ? e.message : 'No se pudo cargar el comprobante.';
        _cargandoComprobante = false;
      });
    }
  }

  /// Nuevo intento lógico de cobro: se descarta el estado anterior (y su
  /// `clientUuid`) antes de abrir el diálogo.
  /// Gap 6: tras cobrar exitosamente, muestra automáticamente el TicketDialog.
  Future<void> _abrirCobro(BuildContext context, Pedido pedido) async {
    ref.invalidate(cobroControllerProvider(widget.pedidoId));
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => CobroDialog(pedido: pedido),
    );
    if (!mounted) return;
    // Gap 6: overlay post-cobro automático.
    final cobro = ref.read(cobroControllerProvider(widget.pedidoId));
    if (cobro.exito && cobro.resultado?.ticketId != null) {
      _mostrarTicketPostCobro(cobro.resultado!.cobroId);
    }
  }

  /// Muestra el TicketDialog automáticamente tras un cobro exitoso.
  void _mostrarTicketPostCobro(String cobroId) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => TicketDialog(cobroId: cobroId),
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

// ---------------------------------------------------------------------------
// Item editable para edición inline (gap 7)
// ---------------------------------------------------------------------------

class _ItemEdit {
  _ItemEdit({
    required this.productoId,
    required this.nombre,
    required this.precio,
    required this.unidadLabel,
    required this.cantidad,
  });

  final String productoId;
  final String nombre;
  final double precio;
  final String unidadLabel;
  double cantidad;

  double get subtotal => redondear2(precio * cantidad);
}

// ---------------------------------------------------------------------------
// Gap 3: comprobante de transferencia
// ---------------------------------------------------------------------------

class _ComprobanteTransferencia extends StatelessWidget {
  const _ComprobanteTransferencia({
    required this.pedidoId,
    required this.comprobanteNombre,
    required this.bytes,
    required this.cargando,
    required this.error,
    required this.onCargar,
  });

  final String pedidoId;
  final String comprobanteNombre;
  final Uint8List? bytes;
  final bool cargando;
  final String? error;
  final VoidCallback onCargar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Material(
        key: const Key('caja_comprobante'),
        color: tema.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Comprobante de transferencia',
                style: tema.textTheme.labelLarge?.copyWith(
                  color: tema.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                comprobanteNombre,
                style: tema.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              if (cargando)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (error != null)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(error!, style: TextStyle(color: tema.colorScheme.error)),
                    const SizedBox(height: 4),
                    TextButton(onPressed: onCargar, child: const Text('Reintentar')),
                  ],
                )
              else if (bytes != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: InteractiveViewer(
                    key: const Key('caja_comprobante_imagen'),
                    child: Image.memory(
                      bytes!,
                      height: 200,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'URL: ${AppConfig.apiBaseUrl}/api/v1/pedidos/$pedidoId/comprobante',
                  style: tema.textTheme.bodySmall?.copyWith(
                    color: tema.colorScheme.outline,
                  ),
                ),
              ] else
                TextButton.icon(
                  key: const Key('caja_comprobante_cargar'),
                  onPressed: onCargar,
                  icon: const Icon(Icons.image_outlined, size: 18),
                  label: const Text('Cargar comprobante'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 7: fila de ítem editable inline
// ---------------------------------------------------------------------------

class _FilaItemEditable extends StatelessWidget {
  const _FilaItemEditable({
    super.key,
    required this.item,
    required this.index,
    required this.onIncrementar,
    required this.onDecrementar,
    required this.onEliminar,
  });

  final _ItemEdit item;
  final int index;
  final VoidCallback onIncrementar;
  final VoidCallback onDecrementar;
  final VoidCallback onEliminar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.nombre,
                  style: tema.textTheme.bodyMedium,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${moneda(item.precio)} / ${item.unidadLabel}',
                  style: tema.textTheme.bodySmall,
                ),
              ],
            ),
          ),
          IconButton(
            key: Key('caja_edit_menos_${item.productoId}'),
            icon: const Icon(Icons.remove_circle_outline, size: 20),
            onPressed: item.cantidad <= 1 ? null : onDecrementar,
          ),
          SizedBox(
            width: 32,
            child: Text(
              cantidadNum(item.cantidad),
              key: Key('caja_edit_cant_${item.productoId}'),
              textAlign: TextAlign.center,
              style: tema.textTheme.bodyMedium,
            ),
          ),
          IconButton(
            key: Key('caja_edit_mas_${item.productoId}'),
            icon: const Icon(Icons.add_circle_outline, size: 20),
            onPressed: onIncrementar,
          ),
          IconButton(
            key: Key('caja_edit_trash_${item.productoId}'),
            icon: Icon(Icons.delete_outline, size: 20, color: tema.colorScheme.error),
            onPressed: onEliminar,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 7: selector de producto para agregar
// ---------------------------------------------------------------------------

class _SelectorAgregarProducto extends ConsumerWidget {
  const _SelectorAgregarProducto({
    required this.seleccionado,
    required this.excluidos,
    required this.onChanged,
    required this.onAgregar,
  });

  final String? seleccionado;
  final Set<String> excluidos;
  final ValueChanged<String?> onChanged;
  final VoidCallback onAgregar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogo = ref.watch(catalogoProvider);
    final productos = catalogo.value?.productos ?? const [];
    final disponibles = productos
        .where((p) => p.activo && !excluidos.contains(p.id))
        .toList();

    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            key: const Key('caja_edit_agregar_selector'),
            initialValue: seleccionado,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Agregar producto…',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: [
              for (final p in disponibles)
                DropdownMenuItem(
                  value: p.id,
                  child: Text(p.nombre, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: onChanged,
          ),
        ),
        const SizedBox(width: 8),
        FilledButton.tonal(
          key: const Key('caja_edit_agregar_btn'),
          onPressed: seleccionado == null ? null : onAgregar,
          child: const Text('Sumar'),
        ),
      ],
    );
  }
}
