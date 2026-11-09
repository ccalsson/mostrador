import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

String _plata(dynamic v) => fmtMoneda(v);

class PantallaFinanciero extends StatefulWidget {
  const PantallaFinanciero({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaFinanciero> createState() => _PantallaFinancieroState();
}

class _PantallaFinancieroState extends State<PantallaFinanciero> {
  static const _diasOpciones = [7, 15, 30];
  int _tab = 0;
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;
  int _dias = 7;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final anios = [for (var y = DateTime.now().year - 3; y <= DateTime.now().year + 1; y++) y.toString()];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Números consolidados de las cuatro apps: P&L, caja y conciliación.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('P&L')),
            ButtonSegment(value: 1, label: Text('Caja')),
            ButtonSegment(value: 2, label: Text('Conciliación')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 14),
        if (_tab == 1)
          Wrap(
            spacing: 8,
            children: [
              for (final d in _diasOpciones)
                ChoiceChip(
                  label: Text('$d días'),
                  selected: _dias == d,
                  onSelected: (_) => setState(() => _dias = d),
                ),
            ],
          )
        else
          Row(
            children: [
              Expanded(
                child: Desplegable(
                  label: 'Mes',
                  valor: _meses[_mes - 1],
                  opciones: _meses,
                  onChanged: (v) => setState(() => _mes = _meses.indexOf(v) + 1),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Desplegable(
                  label: 'Año',
                  valor: _anio.toString(),
                  opciones: anios,
                  onChanged: (v) => setState(() => _anio = int.parse(v)),
                ),
              ),
            ],
          ),
        const SizedBox(height: 14),
        if (_tab == 0)
          VistaDatos<Map<String, dynamic>>(
            key: ValueKey('pl-$_mes-$_anio'),
            cargar: () => widget.api.fnMapa('plConsolidado', <String, dynamic>{'mes': _mes, 'anio': _anio}),
            builder: (context, d) => _pl(context, d),
          )
        else if (_tab == 1)
          VistaDatos<List<dynamic>>(
            key: ValueKey('flujo-$_dias'),
            cargar: () => widget.api.fnLista('flujoCaja', <String, dynamic>{'dias': _dias}),
            builder: (context, d) => _flujo(context, d),
          )
        else
          VistaDatos<Map<String, dynamic>>(
            key: ValueKey('conc-$_mes-$_anio'),
            cargar: () => widget.api.fnMapa('conciliacion', <String, dynamic>{'mes': _mes, 'anio': _anio}),
            builder: (context, d) => _conciliacion(context, d),
          ),
      ],
    );
  }

  Widget _pl(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    final apps = d['apps'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Ingresos', _plata(d['totalIngresos'])),
          ('Gastos', _plata(d['totalGastos'])),
          ('Resultado', _plata(d['totalResultado'])),
          ('Período', texto(d['periodo'])),
        ]),
        const SizedBox(height: 14),
        if (apps.isEmpty)
          Text('Sin movimientos en este período.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final a in apps)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Tarjeta(
                child: Row(
                  children: [
                    Expanded(child: Text(texto(a['app']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                    Text('+${_plata(a['ingresos'])} · −${_plata(a['gastos'])}', style: TextStyle(color: c.muted, fontSize: 12)),
                    const SizedBox(width: 10),
                    Text(_plata(a['resultado']), style: TextStyle(color: numero(a['resultado']) >= 0 ? c.leaf : c.terra, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  Widget _flujo(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) return Text('Sin movimientos.', style: TextStyle(color: c.muted, fontSize: 13));
    final saldoFinal = filas.isNotEmpty ? numero((filas.last as Map)['saldo']) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Días', texto(filas.length)),
          ('Saldo final', _plata(saldoFinal)),
        ]),
        const SizedBox(height: 14),
        for (final f in filas)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Tarjeta(
              child: Row(
                children: [
                  Expanded(child: Text(fmtFecha(f['fecha']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600))),
                  Text('+${_plata(f['ingresos'])}', style: TextStyle(color: c.leaf, fontSize: 12)),
                  const SizedBox(width: 8),
                  Text('−${_plata(f['egresos'])}', style: TextStyle(color: c.terra, fontSize: 12)),
                  const SizedBox(width: 8),
                  SizedBox(width: 96, child: Text('= ${_plata(f['saldo'])}', textAlign: TextAlign.end, style: TextStyle(color: c.muted, fontSize: 12))),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _conciliacion(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    final pagosSinPedido = d['pagosSinPedido'] as List? ?? const [];
    final pedidosSinPago = d['pedidosSinPago'] as List? ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Conciliados', texto(d['conciliados'])),
          ('Pagos sin pedido', texto(pagosSinPedido.length)),
          ('Pedidos sin pago', texto(pedidosSinPago.length)),
        ]),
        const SizedBox(height: 16),
        Text('Pagos sin pedido', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 6),
        if (pagosSinPedido.isEmpty)
          Text('Ninguno.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final r in pagosSinPedido)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Expanded(child: Text('${_id(r['id'])} · ${fmtFecha(r['fecha'])}', style: TextStyle(color: c.ink, fontSize: 13))),
                  Text(_plata(r['monto']), style: TextStyle(color: c.terra, fontSize: 13)),
                ],
              ),
            ),
        const SizedBox(height: 12),
        Text('Pedidos sin pago', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
        const SizedBox(height: 6),
        if (pedidosSinPago.isEmpty)
          Text('Ninguno.', style: TextStyle(color: c.muted, fontSize: 13))
        else
          for (final r in pedidosSinPago)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Expanded(child: Text('${_id(r['id'])} · ${fmtFecha(r['fecha'])}', style: TextStyle(color: c.ink, fontSize: 13))),
                  Text(_plata(r['total']), style: TextStyle(color: c.terra, fontSize: 13)),
                ],
              ),
            ),
      ],
    );
  }

  static String _id(dynamic v) {
    final s = texto(v);
    return s.length > 8 ? s.substring(0, 8) : s;
  }
}
