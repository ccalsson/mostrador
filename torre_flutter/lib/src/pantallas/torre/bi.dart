import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _maximoBarras = 45;

String _momento(dynamic v) {
  final iso = texto(v);
  if (iso.length < 16) return fmtFecha(iso);
  return '${fmtFecha(iso)} ${iso.substring(11, 16)}';
}

String _porcentaje(double v) => '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';

Color _scoreColor(TorreColors c, double score) => score >= 70 ? c.terra : score >= 40 ? c.ambar : c.leaf;

Color _confianzaColor(TorreColors c, double confianza) => confianza >= 0.7 ? c.leaf : confianza >= 0.4 ? c.ambar : c.terra;

IconData _tendenciaIcon(String tendencia) {
  switch (tendencia) {
    case 'subiendo':
      return Icons.trending_up;
    case 'bajando':
      return Icons.trending_down;
    default:
      return Icons.trending_flat;
  }
}

class _Barras extends StatelessWidget {
  const _Barras({required this.puntos, required this.alto});
  final List<(double, Color)> puntos;
  final double alto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    if (puntos.isEmpty) {
      return SizedBox(height: alto, child: Center(child: Text('Sin datos.', style: TextStyle(fontSize: 13, color: c.muted))));
    }
    final maximo = puntos.map((p) => p.$1).reduce((a, b) => a > b ? a : b);
    return SizedBox(
      height: alto,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final (valor, color) in puntos)
            Expanded(
              child: Container(
                height: maximo <= 0 ? 3 : math.max(3, valor / maximo * alto),
                margin: const EdgeInsets.symmetric(horizontal: 1),
                decoration: BoxDecoration(color: color, borderRadius: const BorderRadius.vertical(top: Radius.circular(2))),
              ),
            ),
        ],
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.proporcion, required this.color});
  final double proporcion;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final ancho = (proporcion.clamp(0.0, 1.0) * constraints.maxWidth).clamp(2.0, constraints.maxWidth);
        return Container(
          height: 6,
          decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(3)),
          child: Align(
            alignment: Alignment.centerLeft,
            child: SizedBox(
              width: ancho.toDouble(),
              child: DecoratedBox(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
            ),
          ),
        );
      },
    );
  }
}

class PantallaBi extends StatefulWidget {
  const PantallaBi({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaBi> createState() => _PantallaBiState();
}

class _PantallaBiState extends State<PantallaBi> {
  static const _diasOpciones = [14, 30, 60];
  static const _mesesOpciones = [3, 6, 12];

  int _tab = 0;
  int _dias = 30;
  int _meses = 3;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Tendencia, predicción y riesgo calculados sobre la historia real de todas las apps.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        VistaDatos<Map<String, dynamic>>(
          key: ValueKey('bi-$_dias-$_meses'),
          cargar: () => widget.api.fnMapa('biResultados', <String, dynamic>{'diasForecast': _dias, 'mesesProyeccion': _meses}),
          builder: _cuerpo,
        ),
      ],
    );
  }

  Widget _cuerpo(BuildContext context, Map<String, dynamic> d) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('Revenue')),
            ButtonSegment(value: 1, label: Text('Demanda')),
            ButtonSegment(value: 2, label: Text('Churn')),
            ButtonSegment(value: 3, label: Text('Finanzas')),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
        const SizedBox(height: 12),
        if (_tab == 0)
          _chips('Días a proyectar', [for (final n in _diasOpciones) (n.toString(), n == _dias, () => setState(() => _dias = n))])
        else if (_tab == 3)
          _chips('Meses a proyectar', [for (final n in _mesesOpciones) (n.toString(), n == _meses, () => setState(() => _meses = n))]),
        const SizedBox(height: 12),
        Text(
          'Generado ${_momento(d['generadoAt'])}',
          style: TextStyle(fontSize: 11, color: c.muted),
        ),
        const SizedBox(height: 12),
        if (_tab == 0)
          _revenue(context, (d['revenue'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{})
        else if (_tab == 1)
          _demanda(context, d['demanda'] as List? ?? const [])
        else if (_tab == 2)
          _churn(context, d['churn'] as List? ?? const [])
        else
          _proyeccion(context, d['proyeccion'] as List? ?? const []),
      ],
    );
  }

  Widget _chips(String label, List<(String, bool, VoidCallback)> opciones) {
    final c = torreColorsOf(context);
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('$label:', style: TextStyle(fontSize: 12, color: c.muted)),
        for (final (textoOpcion, seleccionada, onTap) in opciones)
          ChoiceChip(label: Text(textoOpcion), selected: seleccionada, onSelected: (_) => onTap()),
      ],
    );
  }

  Widget _revenue(BuildContext context, Map<String, dynamic> r) {
    final c = torreColorsOf(context);
    final historico = (r['historico'] as List? ?? const []).cast<Map<String, dynamic>>();
    final forecast = (r['forecast'] as List? ?? const []).cast<Map<String, dynamic>>();
    final todos = <(Map<String, dynamic>, bool)>[
      for (final p in historico) (p, false),
      for (final p in forecast) (p, true),
    ];
    final visibles = todos.length > _maximoBarras ? todos.sublist(todos.length - _maximoBarras) : todos;
    final totalForecast = forecast.fold<double>(0, (acc, p) => acc + numero(p['valor']));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Crecimiento mensual', _porcentaje(numero(r['crecimientoPct']))),
          ('Confianza (R²)', '${(numero(r['rCuadrado']) * 100).toStringAsFixed(0)}%'),
          ('Proyección $_dias días', fmtMoneda(totalForecast)),
          ('Pendiente diaria', fmtMoneda(numero(r['pendiente']))),
        ]),
        const SizedBox(height: 14),
        if (visibles.isEmpty)
          Text('Sin cobros registrados en el histórico.', style: TextStyle(fontSize: 13, color: c.muted))
        else ...[
          Tarjeta(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Barras(
                  alto: 120,
                  puntos: [
                    for (final (p, esForecast) in visibles)
                      (numero(p['valor']), esForecast ? c.leaf.withValues(alpha: 0.3) : c.leaf),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(child: Text(fmtFecha(visibles.first.$1['fecha']), style: TextStyle(fontSize: 11, color: c.muted))),
                    Text('${historico.length}d real · ${forecast.length}d forecast', style: TextStyle(fontSize: 11, color: c.muted)),
                    const SizedBox(width: 6),
                    Text(fmtFecha(visibles.last.$1['fecha']), style: TextStyle(fontSize: 11, color: c.muted)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _demanda(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return Text('Sin ventas registradas en los últimos 30 días.', style: TextStyle(fontSize: 13, color: c.muted));
    }
    final maximo = filas.map((f) => numero(f['prediccion7Dias'])).fold<double>(0, (a, b) => b > a ? b : a);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} productos con demanda prevista', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        _Barras(
          alto: 80,
          puntos: [
            for (final f in filas.take(_maximoBarras)) (numero(f['prediccion7Dias']), c.leaf.withValues(alpha: 0.35 + 0.65 * numero(f['confianza']))),
          ],
        ),
        const SizedBox(height: 12),
        for (final f in filas.take(40))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Demanda(f, maximo),
          ),
      ],
    );
  }

  Widget _churn(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) return Text('Sin clientes activos.', style: TextStyle(fontSize: 13, color: c.muted));
    final alto = filas.where((x) => numero(x['score']) >= 70).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KpiGrilla([
          ('Clientes', texto(filas.length)),
          ('Riesgo alto', texto(alto)),
        ]),
        const SizedBox(height: 14),
        _Barras(
          alto: 70,
          puntos: [for (final x in filas.take(_maximoBarras)) (numero(x['score']), _scoreColor(c, numero(x['score'])))],
        ),
        const SizedBox(height: 12),
        for (final x in filas.take(40))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Churn(x),
          ),
      ],
    );
  }

  Widget _proyeccion(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) return Text('Sin movimientos para proyectar.', style: TextStyle(fontSize: 13, color: c.muted));
    final visibles = filas.length > 6 ? filas.sublist(filas.length - 6) : filas;
    final maxIngresos = _maxDe(filas, 'ingresos');
    final maxGastos = _maxDe(filas, 'gastos');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Tarjeta(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Ingresos y gastos por mes', style: TextStyle(fontSize: 12, color: c.muted)),
              const SizedBox(height: 8),
              for (final p in visibles)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 120,
                        child: Text(
                          texto(p['mes']),
                          style: TextStyle(fontSize: 12, color: p['ingresosReales'] == null ? c.muted : c.ink),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _Barra(proporcion: _valorDe(p, 'ingresos') / maxIngresos, color: c.leaf),
                            const SizedBox(height: 3),
                            _Barra(proporcion: _valorDe(p, 'gastos') / maxGastos, color: c.terra),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        for (final p in filas)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Proyeccion(p),
          ),
      ],
    );
  }
}

double _maxDe(List<dynamic> filas, String clave) =>
    filas.map((f) => _valorDe(f, clave)).fold<double>(1, (a, b) => b > a ? b : a);

double _valorDe(dynamic p, String clave) {
  final real = p['${clave}Reales'];
  return real == null ? numero(p['${clave}Proyectados']) : numero(real);
}

class _Demanda extends StatelessWidget {
  const _Demanda(this.f, this.maximo);
  final dynamic f;
  final double maximo;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final confianza = numero(f['confianza']);
    final prediccion = numero(f['prediccion7Dias']);
    final tendencia = texto(f['tendencia']);
    final colorTendencia = tendencia == 'subiendo' ? c.leaf : tendencia == 'bajando' ? c.terra : c.muted;
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(f['producto']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(texto(f['tenantNombre']), style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
              Icon(_tendenciaIcon(tendencia), size: 18, color: colorTendencia),
              const SizedBox(width: 6),
              Text('${prediccion.toStringAsFixed(0)} u/7d', style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              SizedBox(width: 78, child: Text('Prom. ${numero(f['promedioDiario']).toStringAsFixed(1)}/día', style: TextStyle(fontSize: 11, color: c.muted))),
              Expanded(child: _Barra(proporcion: maximo <= 0 ? 0 : prediccion / maximo, color: c.leaf)),
              const SizedBox(width: 6),
              Text('${(confianza * 100).toStringAsFixed(0)}%', style: TextStyle(fontSize: 11, color: _confianzaColor(c, confianza))),
            ],
          ),
        ],
      ),
    );
  }
}

class _Churn extends StatelessWidget {
  const _Churn(this.x);
  final dynamic x;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final score = numero(x['score']);
    final factores = (x['factores'] as List? ?? const []).map(texto).join(' · ');
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(x['clienteNombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      '${texto(x['email']).isEmpty ? '—' : texto(x['email'])} · activa ${fmtFecha(x['ultimaActividad'])}',
                      style: TextStyle(color: c.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(score.toStringAsFixed(0), style: TextStyle(color: _scoreColor(c, score), fontWeight: FontWeight.w600, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 8),
          _Barra(proporcion: score / 100, color: _scoreColor(c, score)),
          if (factores.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(factores, style: TextStyle(color: c.muted, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}

class _Proyeccion extends StatelessWidget {
  const _Proyeccion(this.p);
  final dynamic p;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final proyectado = numero(p['resultadoProyectado']);
    final esProyectado = p['ingresosReales'] == null;
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(texto(p['mes']), style: TextStyle(color: esProyectado ? c.muted : c.ink, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  'Ingresos ${fmtMoneda(_valorDe(p, 'ingresos'))} · Gastos ${fmtMoneda(_valorDe(p, 'gastos'))}',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            esProyectado ? 'proyectado' : 'real',
            style: TextStyle(color: c.muted, fontSize: 11),
          ),
          const SizedBox(width: 8),
          Text(
            fmtMoneda(proyectado),
            style: TextStyle(color: proyectado >= 0 ? c.leaf : c.terra, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
