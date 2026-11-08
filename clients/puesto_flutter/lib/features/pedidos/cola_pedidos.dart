import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';
import '../caja/error_caja.dart';

/// Intervalo de sondeo del tablero. Pasar `null` a `intervalo` lo congela: lo
/// usan los widget tests, que fallan si queda un `Timer.periodic` pendiente.
/// Paridad con la web (`vendedor.tsx:26` refetchInterval: 2500ms).
const Duration kSondeoCola = Duration(milliseconds: 2500);

/// Secciones del tablero, en el orden en que recorre un pedido: entra a la
/// cola de caja, se cobra, se entrega. Cada una mapea al `?estados=` del
/// contrato v1.
enum ColaSeccion {
  enCola('borrador,enviado,en_preparacion,listo', 'En cola'),
  paraEntregar('cobrado', 'Para entregar'),
  entregados('entregado', 'Entregados'),
  anulados('anulado', 'Anulados');

  const ColaSeccion(this.estados, this.label);

  final String estados;
  final String label;
}

/// Claves que cada pantalla ya exponía antes de compartir este tablero; los
/// tests de integración las buscan por su nombre histórico.
enum ColaContexto {
  puesto('pedidos_', 'pedido_tile_'),
  caja('caja_', 'caja_tile_');

  const ColaContexto(this.prefijo, this.tile);

  final String prefijo;
  final String tile;

  Key key(String sufijo) => Key('$prefijo$sufijo');

  Key tileKey(String pedidoId) => Key('$tile$pedidoId');
}

/// Tablero de cola del puesto: una sola lista con las secciones del recorrido
/// de un pedido, sondeada cada [kSondeoCola] para que los nombres aparezcan y
/// se muevan solos. Es la misma vista para vendedor, cajero y dueño; lo único
/// que cambia es el alcance.
class ColaPedidos extends ConsumerStatefulWidget {
  const ColaPedidos({
    super.key,
    required this.contexto,
    required this.onSeleccionar,
    this.titulo,
    this.puedeFiltrarPropios = false,
    this.pedidoIdActivo,
    this.intervalo = kSondeoCola,
  });

  final ColaContexto contexto;
  final ValueChanged<Pedido> onSeleccionar;
  final String? titulo;

  /// Muestra el conmutador "Mis pedidos / Todos". Sólo le sirve al vendedor,
  /// que es el único rol con pedidos propios en el puesto.
  final bool puedeFiltrarPropios;
  final String? pedidoIdActivo;
  final Duration? intervalo;

  @override
  ConsumerState<ColaPedidos> createState() => _ColaPedidosState();
}

class _ColaPedidosState extends ConsumerState<ColaPedidos> {
  bool _soloPropios = false;
  Timer? _sondeo;

  FiltroCola _filtro(ColaSeccion seccion) =>
      (mine: _soloPropios, estados: seccion.estados);

  @override
  void initState() {
    super.initState();
    final intervalo = widget.intervalo;
    if (intervalo != null) {
      _sondeo = Timer.periodic(intervalo, (_) => _refrescar());
    }
  }

  @override
  void dispose() {
    _sondeo?.cancel();
    super.dispose();
  }

  void _refrescar() {
    if (!mounted) return;
    for (final seccion in ColaSeccion.values) {
      ref.invalidate(pedidosColaProvider(_filtro(seccion)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final contexto = widget.contexto;
    final secciones = [
      for (final seccion in ColaSeccion.values)
        (
          seccion: seccion,
          datos: ref.watch(pedidosColaProvider(_filtro(seccion))),
        ),
    ];
    final cargando = secciones.every(
      (s) => s.datos.isLoading && !s.datos.hasValue,
    );
    final refrescando = secciones.any((s) => s.datos.isRefreshing);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _encabezado(context, ref, refrescando: refrescando),
        if (refrescando)
          LinearProgressIndicator(
            key: contexto.key('refrescando'),
            minHeight: 2,
          ),
        Expanded(
          child: cargando
              ? Center(
                  key: contexto.key('cargando'),
                  child: const CircularProgressIndicator(),
                )
              : _cuerpo(context, ref, secciones),
        ),
      ],
    );
  }

  Widget _encabezado(
    BuildContext context,
    WidgetRef ref, {
    required bool refrescando,
  }) {
    final contexto = widget.contexto;
    final tokens = context.tokens;
    final titulo = widget.titulo;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 6),
      child: Row(
        children: [
          if (titulo != null) ...[
            Text(
              titulo,
              style: const TextStyle(
                fontFamily: 'Fraunces',
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 10),
          ],
          const _Vivo(),
          const Spacer(),
          if (widget.puedeFiltrarPropios)
            SegmentedButton<bool>(
              key: contexto.key('alcance'),
              style: ButtonStyle(
                visualDensity: VisualDensity.compact,
                textStyle: WidgetStatePropertyAll(
                  TextStyle(fontSize: 12, color: tokens.ink),
                ),
              ),
              segments: const [
                ButtonSegment(value: true, label: Text('Mis pedidos')),
                ButtonSegment(value: false, label: Text('Todos')),
              ],
              selected: {_soloPropios},
              onSelectionChanged: (seleccion) =>
                  setState(() => _soloPropios = seleccion.first),
            ),
          IconButton(
            key: contexto.key('refrescar'),
            tooltip: refrescando ? 'Actualizando' : 'Actualizar pedidos',
            onPressed: refrescando ? null : _refrescar,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
    );
  }

  Widget _cuerpo(
    BuildContext context,
    WidgetRef ref,
    List<({ColaSeccion seccion, AsyncValue<List<Pedido>> datos})> secciones,
  ) {
    final contexto = widget.contexto;
    final conError = secciones.where((s) => s.datos.hasError).toList();
    if (conError.isNotEmpty) {
      final error = conError.first.datos.error;
      return ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudieron cargar los pedidos.',
        onReintentar: _refrescar,
        claveReintentar: contexto.key('reintentar'),
      );
    }
    final visibles = [
      for (final s in secciones)
        if ((s.datos.value ?? const []).isNotEmpty) s,
    ];
    if (visibles.isEmpty) return _SinPedidos(contexto: contexto);
    return Tarjeta(
      padding: EdgeInsets.zero,
      child: ListView(
        key: contexto.key('lista'),
        padding: const EdgeInsets.symmetric(vertical: 2),
        children: [
          for (final s in visibles) ...[
            _EncabezadoSeccion(
              seccion: s.seccion,
              cantidad: (s.datos.value ?? const []).length,
            ),
            for (final pedido in s.datos.value ?? const [])
              _FilaCola(
                key: contexto.tileKey(pedido.id),
                pedido: pedido,
                seleccionado: pedido.id == widget.pedidoIdActivo,
                mostrarVendedor: !_soloPropios,
                onTap: () => widget.onSeleccionar(pedido),
              ),
          ],
        ],
      ),
    );
  }
}

/// Punto verde estático + "En vivo": el tablero se sondea solo, sin animación
/// continua para no interferir con los pumps de los tests.
class _Vivo extends StatelessWidget {
  const _Vivo();

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.circle, size: 7, color: tokens.ok),
        const SizedBox(width: 5),
        Text('En vivo', style: TextStyle(fontSize: 11.5, color: tokens.ok)),
      ],
    );
  }
}

class _EncabezadoSeccion extends StatelessWidget {
  const _EncabezadoSeccion({required this.seccion, required this.cantidad});

  final ColaSeccion seccion;
  final int cantidad;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          Text(
            seccion.label.toUpperCase(),
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
              color: tokens.muted,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$cantidad',
            style: TextStyle(fontSize: 10.5, color: tokens.muted),
          ),
        ],
      ),
    );
  }
}

class _FilaCola extends StatefulWidget {
  const _FilaCola({
    super.key,
    required this.pedido,
    required this.seleccionado,
    required this.mostrarVendedor,
    required this.onTap,
  });

  final Pedido pedido;
  final bool seleccionado;
  final bool mostrarVendedor;
  final VoidCallback onTap;

  @override
  State<_FilaCola> createState() => _FilaColaState();
}

class _FilaColaState extends State<_FilaCola> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final pedido = widget.pedido;
    final meta = [
      if (widget.mostrarVendedor && pedido.vendedorNombre != null)
        pedido.vendedorNombre!,
      '${pedido.items.length} ${pedido.items.length == 1 ? 'ítem' : 'ítems'}',
      moneda(pedido.total),
      horaCorta(pedido.createdAt),
    ].join(' · ');

    final contenido = Container(
      constraints: const BoxConstraints(minHeight: 44),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: widget.seleccionado ? tokens.okBg : (_encima ? tokens.paper : null),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  pedido.clienteNombre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: tokens.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  meta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: tokens.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _badge(pedido.estado, tokens),
        ],
      ),
    );

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(onTap: widget.onTap, child: contenido),
    );
  }

  Widget _badge(PedidoEstado estado, TokensMostrador tokens) {
    final (color, fondo) = switch (estado) {
      PedidoEstado.borrador => (tokens.muted, null),
      PedidoEstado.enviado => (tokens.terra, null),
      PedidoEstado.enPreparacion => (tokens.naranja, null),
      PedidoEstado.listo => (tokens.ambar, null),
      PedidoEstado.cobrado => (tokens.ok, null),
      PedidoEstado.entregado => (tokens.ok, tokens.okBg),
      PedidoEstado.anulado => (tokens.alerta, null),
    };
    return Pildora(estado.label, color: color, fondo: fondo);
  }
}

class _SinPedidos extends StatelessWidget {
  const _SinPedidos({required this.contexto});

  final ColaContexto contexto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Center(
      key: contexto.key('vacio'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.receipt_long_outlined,
            size: 56,
            color: tema.colorScheme.outline,
          ),
          const SizedBox(height: 12),
          const Text('No hay pedidos en la cola.', textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(
            'Aparecen acá apenas se confirman.',
            textAlign: TextAlign.center,
            style: tema.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
