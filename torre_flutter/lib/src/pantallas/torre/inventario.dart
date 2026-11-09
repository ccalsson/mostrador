import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaInventario extends StatefulWidget {
  const PantallaInventario({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaInventario> createState() => _PantallaInventarioState();
}

class _PantallaInventarioState extends State<PantallaInventario> {
  static const _diasOpciones = [1, 7, 30];

  int _tab = 0;
  final _controlador = TextEditingController();
  String _busqueda = '';
  bool _stockBajo = false;
  int _dias = 7;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<List<dynamic>> _cargarStock() => widget.api.fnLista('inventarioStock', <String, dynamic>{
        'filtros': <String, dynamic>{
          'busqueda': _busqueda.trim(),
          'stockBajo': _stockBajo,
        },
      });

  Future<List<dynamic>> _cargarMovimientos() => widget.api.fnLista('inventarioMovimientos', <String, dynamic>{'dias': _dias});

  void _buscar() => setState(() => _busqueda = _controlador.text);

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Stock, movimientos y alertas de todos los negocios, incluido lo que no se mueve.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        VistaDatos<Map<String, dynamic>>(
          key: const ValueKey('inventario-resumen'),
          cargar: () => widget.api.fnMapa('inventarioResumen'),
          builder: (context, r) => KpiGrilla([
            ('Productos', texto(r['totalProductos'])),
            ('Stock bajo', texto(r['productosStockBajo'])),
            ('Sin stock', texto(r['productosSinStock'])),
            ('Movimientos hoy', texto(r['movimientosHoy'])),
          ]),
        ),
        const SizedBox(height: 14),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('Stock')),
            ButtonSegment(value: 1, label: Text('Movimientos')),
            ButtonSegment(value: 2, label: Text('Alertas')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 14),
        if (_tab == 0) ..._barraStock(),
        if (_tab == 1)
          Wrap(
            spacing: 8,
            children: [
              for (final d in _diasOpciones)
                ChoiceChip(
                  label: Text(d == 1 ? 'Hoy' : '$d días'),
                  selected: _dias == d,
                  onSelected: (_) => setState(() => _dias = d),
                ),
            ],
          ),
        if (_tab != 2) const SizedBox(height: 14),
        if (_tab == 0)
          VistaDatos<List<dynamic>>(
            key: ValueKey('inv-stock-$_busqueda-$_stockBajo'),
            cargar: _cargarStock,
            builder: (context, filas) => _stock(context, filas, 'No hay productos que coincidan con los filtros.'),
          )
        else if (_tab == 1)
          VistaDatos<List<dynamic>>(
            key: ValueKey('inv-mov-$_dias'),
            cargar: _cargarMovimientos,
            builder: (context, filas) => _movimientos(context, filas, 'No hay movimientos en el período seleccionado.'),
          )
        else
          VistaDatos<List<dynamic>>(
            key: const ValueKey('inv-alertas'),
            cargar: () => widget.api.fnLista('inventarioAlertas'),
            builder: (context, filas) => _alertas(context, filas),
          ),
      ],
    );
  }

  List<Widget> _barraStock() => [
        TextField(
          controller: _controlador,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _buscar(),
          decoration: InputDecoration(
            hintText: 'Buscar por producto o negocio',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward, size: 20), onPressed: _buscar),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            FilterChip(
              label: const Text('Solo stock bajo'),
              selected: _stockBajo,
              onSelected: (v) => setState(() => _stockBajo = v),
            ),
          ],
        ),
      ];

  Widget _stock(BuildContext context, List<dynamic> filas, String vacio) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) return Text(vacio, style: TextStyle(fontSize: 13, color: c.muted));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} productos', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final s in filas.take(300))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Stock(s),
          ),
      ],
    );
  }

  Widget _movimientos(BuildContext context, List<dynamic> filas, String vacio) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) return Text(vacio, style: TextStyle(fontSize: 13, color: c.muted));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} movimientos', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final m in filas.take(200))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Movimiento(m),
          ),
      ],
    );
  }

  Widget _alertas(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return Text('No hay alertas. Todo en orden.', style: TextStyle(fontSize: 13, color: c.muted));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} alertas', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final a in filas.take(200))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Alerta(a),
          ),
      ],
    );
  }
}

String _tipo(dynamic v) {
  const etiquetas = {
    'entrada_remito': 'Entrada',
    'venta': 'Venta',
    'anulacion_venta': 'Anulación',
    'ajuste': 'Ajuste',
    'merma': 'Merma',
    'reserva': 'Reserva',
    'liberacion': 'Liberación',
    'stock_bajo': 'Stock bajo',
    'stock_negativo': 'Stock negativo',
    'sin_movimientos': 'Sin movimientos',
  };
  final clave = texto(v);
  return etiquetas[clave] ?? clave;
}

String _momento(dynamic v) {
  final iso = texto(v);
  if (iso.length < 16) return fmtFecha(iso);
  return '${fmtFecha(iso)} ${iso.substring(11, 16)}';
}

class _Stock extends StatelessWidget {
  const _Stock(this.s);
  final dynamic s;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final stock = numero(s['stock']);
    final negativo = stock < 0;
    final bajo = s['stockBajo'] == true;
    final etiqueta = negativo ? 'Negativo' : bajo ? 'Bajo' : 'OK';
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(texto(s['productoNombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  '${texto(s['tenantNombre'])} · mínimo ${texto(s['stockMinimo'])}',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${texto(s['stock'])} ${texto(s['unidad'])}',
            style: TextStyle(color: bajo ? c.terra : c.muted, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 8),
          ChipEstado(etiqueta, activo: !bajo && !negativo),
        ],
      ),
    );
  }
}

class _Movimiento extends StatelessWidget {
  const _Movimiento(this.m);
  final dynamic m;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final cantidad = numero(m['cantidad']);
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(m['productoNombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(texto(m['tenantNombre']), style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                cantidad >= 0 ? '+${texto(m['cantidad'])}' : texto(m['cantidad']),
                style: TextStyle(color: cantidad >= 0 ? c.leaf : c.terra, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ChipEstado(_tipo(m['tipo']), activo: cantidad >= 0),
              Text(_momento(m['createdAt']), style: TextStyle(color: c.muted, fontSize: 12)),
              if (texto(m['referencia']).isNotEmpty)
                Text(texto(m['referencia']), style: TextStyle(color: c.muted, fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Alerta extends StatelessWidget {
  const _Alerta(this.a);
  final dynamic a;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final severidad = texto(a['severidad']);
    final color = severidad == 'alta' ? c.terra : severidad == 'media' ? c.ambar : c.muted;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: severidad == 'baja' ? c.paper2 : c.warnBg,
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${_tipo(a['tipo'])} · ${texto(a['tenantNombre'])}'.toUpperCase(),
            style: TextStyle(color: c.muted, fontSize: 11, letterSpacing: 0.6),
          ),
          const SizedBox(height: 4),
          Text(texto(a['productoNombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(texto(a['detalle']), style: TextStyle(color: color, fontSize: 13)),
        ],
      ),
    );
  }
}
