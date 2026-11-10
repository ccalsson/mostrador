import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/refresco.dart';
import '../../models/cobro.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';
import 'caja_estado_pane.dart';
import 'caja_providers.dart';
import 'cobro_controller.dart';
import 'cobro_dialog.dart';
import 'edicion_items_controller.dart';
import 'editar_items_dialog.dart';
import 'egresos_pane.dart';
import 'error_caja.dart';
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

/// Alto mínimo para que la ficha conserve su barra de acciones fija. En el
/// teléfono quedan ~250dp, que alcanzan para la barra (90dp) y un par de
/// pedidos. Por debajo de este piso —con el teclado abierto la ventana se
/// achica más que la propia barra— el Column desborda y "Cobrar" se va de la
/// vista: ahí la ficha pasa a un único scroll donde la barra va al final y se
/// llega deslizando.
const double _kCajaFichaFija = 140;

/// Ancho a partir del cual la caja muestra lista y ficha lado a lado. Por
/// debajo —el teléfono— la ficha ocupa toda la pantalla y se vuelve a la lista
/// con "Pedidos"; repartir 360px entre dos paneles dejaba el botón de cobro
/// fuera de la vista.
const double _kCajaDosPaneles = 700;

/// Alto mínimo de la vista de pedidos para armarla con sus barras fijas. Con el
/// teclado abierto sobre el diálogo de cobro, la página de atrás se queda en
/// ~60dp: ahí las barras de 48px no caben ni siquiera apiladas y el Column
/// desborda. Por debajo de este piso todo entra en un único scroll.
const double _kCajaVistaBaja = 200;

/// Vistas del área Caja: pedidos (cobro), estado del turno y egresos.
enum CajaVista {
  pedidos('Pedidos'),
  estado('Estado de caja'),
  egresos('Egresos');

  const CajaVista(this.label);

  final String label;
}

/// Muestra un monto o "·····" según el estado de visibilidad.
class MontoOculto extends StatelessWidget {
  const MontoOculto({
    super.key,
    required this.monto,
    required this.visible,
    this.style,
    this.textAlign,
  });

  final double monto;
  final bool visible;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    return Text(
      visible ? moneda(monto) : '·····',
      style: style,
      textAlign: textAlign,
    );
  }
}

/// Caja (desktop): vista de pedidos (lista a la izquierda, detalle con cobro a
/// la derecha), vista del estado del turno y vista de egresos. Incluye toggle
/// de montos y notificación de pedidos nuevos.
///
/// La lista y el pedido abierto se releen solos, en el teléfono con una ficha
/// a pantalla completa. El sondeo es el lento ([kSondeoMuyLento]) y se suspende
/// mientras hay un cobro o una edición en curso; el botón de actualizar queda
/// para el pedido explícito. Pasar `intervalo: null` lo congela (widget tests).
class CajaPane extends ConsumerStatefulWidget {
  const CajaPane({super.key, this.intervalo = kSondeoMuyLento});

  final Duration? intervalo;

  @override
  ConsumerState<CajaPane> createState() => _CajaPaneState();
}

class _CajaPaneState extends ConsumerState<CajaPane>
    with RefrescoAutomatico<CajaPane> {
  CajaVista _vista = CajaVista.pedidos;
  CajaFiltro _filtro = CajaFiltro.porCobrar;
  String? _seleccionado;

  /// Cobro o edición abiertos: el sondeo espera a que se cierren.
  bool _pausado = false;

  /// El sondeo de 30 s relee y pinta en silencio; sólo el botón de actualizar
  /// (y el de la ficha) merecen la barra de progreso, que interrumpía la lectura.
  bool _refrescoManual = false;

  /// IDs de pedidos ya vistos. Se inicializa con la primera carga; a partir de
  /// ahí, cualquier ID nuevo dispara la notificación.
  Set<String> _seenIds = {};
  bool _primeraCarga = true;

  @override
  Duration? get intervalo => widget.intervalo;

  @override
  bool get pausarSondeo => _pausado;

  @override
  Future<void> refrescar() async {
    await releer(
      () => ref.refresh(pedidosCajaProvider(_filtro.estados).future),
    );
    final seleccionado = _seleccionado;
    if (seleccionado != null) {
      await releer(
        () => ref.refresh(pedidoDetalleProvider(seleccionado).future),
      );
    }
  }

  /// Apaga el sondeo mientras dura el diálogo y, al cerrarlo, recupera el tick
  /// que cayó en la pausa.
  void _pausar(bool pausa) {
    _pausado = pausa;
    if (!pausa) reanudarSondeo();
  }

  void _marcarRefrescoManual(bool manual) {
    if (!mounted) return;
    setState(() => _refrescoManual = manual);
  }

  Future<void> _refrescarManual() async {
    _marcarRefrescoManual(true);
    try {
      await sondeoAhora();
    } finally {
      _marcarRefrescoManual(false);
    }
  }

  /// En un teléfono los `SegmentedButton` no entran junto al botón de recargar:
  /// se deslizan en horizontal antes que desbordar y cortar el botón.
  Widget _segmentos(Widget botones, double ancho) => ancho >= _kCajaDosPaneles
      ? Expanded(child: botones)
      : Flexible(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: botones,
          ),
        );

  Widget _detalle(
    bool mostrarMontos, {
    bool enScroll = false,
    VoidCallback? onVolver,
  }) {
    final seleccionado = _seleccionado;
    if (seleccionado == null) return const _SinSeleccion();
    return _CajaDetalle(
      pedidoId: seleccionado,
      mostrarMontos: mostrarMontos,
      onPausa: _pausar,
      enScroll: enScroll,
      onVolver: onVolver,
      progresoManual: _refrescoManual,
      onRefrescoManual: _marcarRefrescoManual,
    );
  }

  @override
  Widget build(BuildContext context) {
    final mostrarMontos = ref.watch(mostrarMontosProvider);
    final ancho = MediaQuery.sizeOf(context).width;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              _segmentos(
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
                ancho,
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('caja_toggle_montos'),
                tooltip: mostrarMontos ? 'Ocultar montos' : 'Mostrar montos',
                icon: Icon(
                  mostrarMontos
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
                onPressed: () {
                  ref.read(mostrarMontosProvider.notifier).alternar();
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: switch (_vista) {
            CajaVista.pedidos => _vistaPedidos(context, ref, mostrarMontos),
            CajaVista.estado => const CajaEstadoPane(),
            CajaVista.egresos => const EgresosPane(),
          },
        ),
      ],
    );
  }

  Widget _vistaPedidos(
    BuildContext context,
    WidgetRef ref,
    bool mostrarMontos,
  ) {
    final ancho = MediaQuery.sizeOf(context).width;
    final pedidos = ref.watch(pedidosCajaProvider(_filtro.estados));

    // Notificación de pedidos nuevos: comparar IDs con la carga anterior.
    ref.listen<AsyncValue<List<Pedido>>>(pedidosCajaProvider(_filtro.estados), (
      anterior,
      siguiente,
    ) {
      final lista = siguiente.value;
      if (lista == null) return;
      final ids = {for (final p in lista) p.id};
      if (_primeraCarga) {
        _seenIds = ids;
        _primeraCarga = false;
        return;
      }
      final nuevos = ids.difference(_seenIds);
      if (nuevos.isNotEmpty) {
        _notificarPedidoNuevo(context, nuevos.first);
      }
      _seenIds = ids;
    });

    final barra = Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          _segmentos(
            SegmentedButton<CajaFiltro>(
              key: const Key('caja_filtro'),
              segments: [
                for (final filtro in CajaFiltro.values)
                  ButtonSegment(value: filtro, label: Text(filtro.label)),
              ],
              selected: {_filtro},
              onSelectionChanged: (seleccion) {
                setState(() {
                  _filtro = seleccion.first;
                  _primeraCarga = true;
                  _seenIds = {};
                });
              },
            ),
            ancho,
          ),
          const SizedBox(width: 8),
          IconButton(
            key: const Key('caja_refrescar'),
            tooltip: 'Actualizar pedidos',
            onPressed: pedidos.isRefreshing ? null : _refrescarManual,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
    );

    // En el teléfono la ficha ocupa toda la pantalla: la barra de filtros no
    // pinta nada ahí y le robaba 64dp al cobro.
    final barraFiltros = ancho >= _kCajaDosPaneles || _seleccionado == null;

    // El sondeo pasa desapercibido: la barra de progreso sólo aparece cuando el
    // operador aprieta el botón, que es el único refresco que pide aviso.
    final List<Widget> progreso = _refrescoManual && pedidos.isRefreshing
        ? const [LinearProgressIndicator(key: Key('caja_refrescando'))]
        : const [];

    // Con [enScroll] true no cabe ningún `Expanded` dentro del scroll único, así
    // que la lista y la ficha se comprimen a su alto real.
    Widget cuerpo(bool enScroll) => ancho >= _kCajaDosPaneles
        ? Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 380,
                child: _lista(
                  context,
                  ref,
                  pedidos,
                  mostrarMontos,
                  enScroll: enScroll,
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(child: _detalle(mostrarMontos, enScroll: enScroll)),
            ],
          )
        : _seleccionado == null
        ? _lista(context, ref, pedidos, mostrarMontos, enScroll: enScroll)
        : _detalle(
            mostrarMontos,
            enScroll: enScroll,
            onVolver: () => setState(() => _seleccionado = null),
          );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (ancho < _kCajaDosPaneles &&
            constraints.maxHeight < _kCajaVistaBaja) {
          return SingleChildScrollView(
            key: const Key('caja_vista_baja'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [if (barraFiltros) barra, ...progreso, cuerpo(true)],
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (barraFiltros) barra,
            ...progreso,
            Expanded(child: cuerpo(false)),
          ],
        );
      },
    );
  }

  /// Notifica al operador con un SnackBar y vibración suave.
  void _notificarPedidoNuevo(BuildContext context, String pedidoId) {
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        key: const Key('caja_pedido_nuevo_snackbar'),
        content: Text('Pedido nuevo Nº $pedidoId'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Widget _lista(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<List<Pedido>> pedidos,
    bool mostrarMontos, {
    bool enScroll = false,
  }) {
    if (pedidos.isLoading && !pedidos.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('caja_cargando')),
      );
    }
    final lista = pedidos.value;
    if (lista == null) {
      final error = pedidos.error;
      return ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudieron cargar los pedidos.',
        onReintentar: sondeoAhora,
      );
    }
    if (lista.isEmpty) {
      return const _SinPedidosCaja();
    }
    return ListView.separated(
      key: const Key('caja_lista'),
      shrinkWrap: enScroll,
      physics: enScroll ? const NeverScrollableScrollPhysics() : null,
      itemCount: lista.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final pedido = lista[index];
        return ListTile(
          key: Key('caja_tile_${pedido.id}'),
          selected: pedido.id == _seleccionado,
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text('Nº ${pedido.id}'),
          subtitle: Text(
            pedido.pickedUpAt != null
                ? '${pedido.clienteNombre} · ${pedido.estado.label} · '
                      'Retirado · ${pedido.cargadorNombre ?? 'Cargador'} · '
                      '${fechaCorta(pedido.pickedUpAt!)}'
                : '${pedido.clienteNombre} · ${pedido.estado.label}',
          ),
          trailing: MontoOculto(
            monto: pedido.total,
            visible: mostrarMontos,
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
          Icon(
            Icons.point_of_sale_outlined,
            size: 56,
            color: tema.colorScheme.outline,
          ),
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
          Icon(
            Icons.receipt_long_outlined,
            size: 56,
            color: tema.colorScheme.outline,
          ),
          const SizedBox(height: 12),
          const Text(
            'No hay pedidos con este filtro',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _CajaDetalle extends ConsumerWidget {
  const _CajaDetalle({
    required this.pedidoId,
    required this.mostrarMontos,
    required this.onPausa,
    required this.onRefrescoManual,
    this.enScroll = false,
    this.onVolver,
    this.progresoManual = false,
  });

  final String pedidoId;
  final bool mostrarMontos;

  /// Suspende el sondeo mientras un diálogo está abierto.
  final ValueChanged<bool> onPausa;

  /// La ficha vive dentro del scroll de la vista (ventana achicada): no puede
  /// usar `Expanded` y se comprime a su alto real.
  final bool enScroll;

  /// En el teléfono la ficha ocupa la pantalla entera, así que el regreso a la
  /// lista vive en su propia barra fija en vez de una fila aparte.
  final VoidCallback? onVolver;

  /// Si el refresco que se está viendo lo pidió el operador (botón) o el sondeo
  /// automático; sólo el primero merece barra de progreso.
  final bool progresoManual;
  final ValueChanged<bool> onRefrescoManual;

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
      return ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudo cargar el pedido.',
        onReintentar: () => ref.invalidate(pedidoDetalleProvider(pedidoId)),
        claveReintentar: const Key('caja_detalle_reintentar'),
      );
    }
    final resultado = cobro.resultado;
    // Las acciones van en una barra aparte, no entre los ítems: mezcladas con
    // una lista larga, en el teléfono "Cobrar" quedaba bajo el borde.
    final acciones = <Widget>[
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
    ];
    final filas = <Widget>[
      ListTile(
        title: Text('Nº ${pedido.id}', key: const Key('caja_detalle_id')),
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
              onPressed: detalle.isRefreshing ? null : () => _releer(ref),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
      ),
      if (cobro.exito && resultado != null)
        _ExitoCobro(resultado: resultado, mostrarMontos: mostrarMontos),
      const Divider(height: 1),
      for (final item in pedido.items)
        ListTile(
          key: Key('caja_item_${item.productoId}'),
          title: Text(item.nombre),
          subtitle: Text(
            '${cantidadNum(item.cantidad)} × ${moneda(item.precioUnitario)}'
            ' / ${item.unidadLabel}',
          ),
          trailing: MontoOculto(monto: item.subtotal, visible: mostrarMontos),
        ),
      const Divider(height: 1),
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
    ];
    final barra = Container(
      decoration: BoxDecoration(
        color: tema.scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: tema.dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (onVolver != null)
                    IconButton(
                      key: const Key('caja_detalle_volver'),
                      tooltip: 'Volver a pedidos',
                      onPressed: onVolver,
                      icon: const Icon(Icons.arrow_back),
                    ),
                  Text('Total: ', style: tema.textTheme.titleLarge),
                  Expanded(
                    // El monto en grande y el regreso no siempre caben lado a
                    // lado: sin escala el texto se sale de la pantalla.
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: MontoOculto(
                        key: const Key('caja_detalle_total'),
                        monto: pedido.total,
                        visible: mostrarMontos,
                        style: tema.textTheme.titleLarge,
                      ),
                    ),
                  ),
                ],
              ),
              if (acciones.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 12, runSpacing: 8, children: acciones),
              ],
            ],
          ),
        ),
      ),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final List<Widget> progreso = progresoManual && detalle.isRefreshing
            ? const [
                LinearProgressIndicator(key: Key('caja_detalle_refrescando')),
              ]
            : const [];
        if (!enScroll && constraints.maxHeight >= _kCajaFichaFija) {
          return Column(
            children: [
              ...progreso,
              Expanded(
                child: ListView(
                  key: const Key('caja_detalle'),
                  children: filas,
                ),
              ),
              barra,
            ],
          );
        }
        final compacta = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ...progreso,
            ListView(
              key: const Key('caja_detalle'),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: filas,
            ),
            barra,
          ],
        );
        // Dentro del scroll de la vista ya hay una sola superficie deslizante:
        // envolver de nuevo dejaría un scroll anidado que se queda clavado.
        if (enScroll) return compacta;
        return SingleChildScrollView(
          key: const Key('caja_detalle_ajustada'),
          child: compacta,
        );
      },
    );
  }

  /// Lectura pedida con el botón: avisa al padre para que la barra se muestre
  /// sólo durante ésta, porque el sondeo de 30 s pasa desapercibido.
  Future<void> _releer(WidgetRef ref) async {
    onRefrescoManual(true);
    await releer(() => ref.refresh(pedidoDetalleProvider(pedidoId).future));
    onRefrescoManual(false);
  }

  /// Nuevo intento lógico de cobro: se descarta el estado anterior (y su
  /// `clientUuid`) antes de abrir el diálogo.
  Future<void> _abrirCobro(
    BuildContext context,
    WidgetRef ref,
    Pedido pedido,
  ) async {
    ref.invalidate(cobroControllerProvider(pedidoId));
    onPausa(true);
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => CobroDialog(pedido: pedido),
    );
    onPausa(false);
  }

  Future<void> _abrirEdicion(
    BuildContext context,
    WidgetRef ref,
    Pedido pedido,
  ) async {
    ref.invalidate(edicionItemsControllerProvider(pedidoId));
    onPausa(true);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => EditarItemsDialog(pedido: pedido),
    );
    onPausa(false);
  }
}

class _ExitoCobro extends ConsumerWidget {
  const _ExitoCobro({required this.resultado, required this.mostrarMontos});

  final CobroResultado resultado;
  final bool mostrarMontos;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
            Wrap(
              children: [
                Text('Total: ', style: estilo),
                MontoOculto(
                  key: const Key('cobro_exito_total'),
                  monto: resultado.total,
                  visible: mostrarMontos,
                  style: estilo,
                ),
                Text(' · Vuelto: ', style: estilo),
                MontoOculto(
                  key: const Key('cobro_exito_vuelto'),
                  monto: resultado.vuelto,
                  visible: mostrarMontos,
                  style: estilo,
                ),
              ],
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
