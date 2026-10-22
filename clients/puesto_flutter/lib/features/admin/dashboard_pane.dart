import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/dashboard.dart';
import '../../services/dashboard_service.dart';

enum _Metrica { ventas, tickets }

enum _Estilo { barras, linea }

/// Panel de dashboard para el admin: KPIs con deltas, serie temporal,
/// formas de pago, top productos, cola de pedidos y últimos movimientos.
///
/// Períodos: hoy (serie horaria, autorefresh 2s), 7 días y 30 días.
class DashboardPane extends ConsumerStatefulWidget {
  const DashboardPane({super.key});

  @override
  ConsumerState<DashboardPane> createState() => _DashboardPaneState();
}

class _DashboardPaneState extends ConsumerState<DashboardPane> {
  _Metrica _metrica = _Metrica.ventas;
  _Estilo _estilo = _Estilo.barras;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _reprogramarTicker();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Autorefresh cada 2 s sólo para `dias == 1` ("En vivo"), como la web.
  void _reprogramarTicker() {
    _ticker?.cancel();
    _ticker = null;
    if (ref.read(dashboardDiasProvider) != 1) return;
    _ticker = Timer.periodic(const Duration(seconds: 2), (_) {
      if (!mounted) return;
      ref.invalidate(dashboardProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final dias = ref.watch(dashboardDiasProvider);
    final resumen = ref.watch(dashboardProvider);
    final vivo = dias == 1;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    const Text(
                      'Dashboard',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                    ),
                    if (vivo) ...[
                      const SizedBox(width: 10),
                      const _PuntoVivo(),
                      const SizedBox(width: 4),
                      Text('en vivo',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
              SegmentedButton<int>(
                key: const Key('dashboard_periodo'),
                segments: const [
                  ButtonSegment(value: 1, label: Text('Hoy')),
                  ButtonSegment(value: 7, label: Text('7d')),
                  ButtonSegment(value: 30, label: Text('30d')),
                ],
                selected: {dias},
                onSelectionChanged: (seleccion) {
                  ref
                      .read(dashboardDiasProvider.notifier)
                      .setDias(seleccion.first);
                  _reprogramarTicker();
                },
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('dashboard_refresh'),
                tooltip: 'Actualizar',
                onPressed: () => ref.invalidate(dashboardProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: resumen.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudo cargar el dashboard.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    key: const Key('dashboard_reintentar'),
                    onPressed: () => ref.invalidate(dashboardProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (data) => _DashboardBody(
              data: data,
              dias: dias,
              metrica: _metrica,
              estilo: _estilo,
              onMetrica: (m) => setState(() => _metrica = m),
              onEstilo: (e) => setState(() => _estilo = e),
            ),
          ),
        ),
      ],
    );
  }
}

class _PuntoVivo extends StatelessWidget {
  const _PuntoVivo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.tertiary,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({
    required this.data,
    required this.dias,
    required this.metrica,
    required this.estilo,
    required this.onMetrica,
    required this.onEstilo,
  });

  final DashboardResumen data;
  final int dias;
  final _Metrica metrica;
  final _Estilo estilo;
  final ValueChanged<_Metrica> onMetrica;
  final ValueChanged<_Estilo> onEstilo;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final tarjetas = <Widget>[
      _KpiCard(
        clave: 'dashboard_kpi_ventas',
        icono: Icons.trending_up,
        titulo: 'Ventas',
        valor: moneda(data.ventas),
        deltaPct: data.deltaVentasPct(),
        color: colorScheme.primary,
      ),
      _KpiCard(
        clave: 'dashboard_kpi_tickets',
        icono: Icons.receipt_long_outlined,
        titulo: 'Tickets',
        valor: '${data.tickets}',
        deltaPct: data.deltaTicketsPct(),
        color: Colors.blue,
      ),
      _KpiCard(
        clave: 'dashboard_kpi_ticket_promedio',
        icono: Icons.calculate_outlined,
        titulo: 'Ticket prom.',
        valor: moneda(data.ticketPromedio),
        color: colorScheme.secondary,
      ),
      _KpiCard(
        clave: 'dashboard_kpi_cola',
        icono: Icons.hourglass_top_outlined,
        titulo: 'En cola',
        valor: '${data.enCola}',
        color: data.enCola > 0 ? Colors.orange : colorScheme.onSurfaceVariant,
      ),
    ];

    return ListView(
      key: const Key('dashboard_lista'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final columnas = constraints.maxWidth >= 900
                ? 4
                : constraints.maxWidth >= 600
                    ? 2
                    : 1;
            return GridView.count(
              crossAxisCount: columnas,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 2.4,
              children: tarjetas,
            );
          },
        ),
        const SizedBox(height: 24),
        _SerieCard(
          data: data,
          dias: dias,
          metrica: metrica,
          estilo: estilo,
          onMetrica: onMetrica,
          onEstilo: onEstilo,
        ),
        const SizedBox(height: 24),
        if (data.formas.isNotEmpty)
          _FormasCard(formas: data.formas, ventas: data.ventas),
        if (data.top.isNotEmpty) ...[
          const SizedBox(height: 24),
          _TopCard(top: data.top),
        ],
        if (data.cola.isNotEmpty) ...[
          const SizedBox(height: 24),
          _ColaCard(cola: data.cola),
        ],
        if (data.movimientos.isNotEmpty) ...[
          const SizedBox(height: 24),
          _MovimientosCard(movimientos: data.movimientos),
        ],
        const SizedBox(height: 24),
        Text(
          dias == 1
              ? 'Serie horaria · hoy'
              : 'Serie diaria · últimos $dias días',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.clave,
    required this.icono,
    required this.titulo,
    required this.valor,
    required this.color,
    this.deltaPct,
  });

  final String clave;
  final IconData icono;
  final String titulo;
  final String valor;
  final Color color;
  final double? deltaPct;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final delta = deltaPct;
    final Color? deltaColor = delta == null
        ? null
        : delta > 0
            ? Colors.green
            : delta < 0
                ? Colors.red
                : theme.colorScheme.onSurfaceVariant;
    return Card(
      key: Key(clave),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(icono, size: 18, color: color),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    titulo,
                    style: theme.textTheme.bodySmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            Text(
              valor,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (delta != null)
              Row(
                children: [
                  Icon(
                    delta >= 0 ? Icons.arrow_upward : Icons.arrow_downward,
                    size: 14,
                    color: deltaColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${delta.abs().toStringAsFixed(1)}% vs período anterior',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: deltaColor, fontSize: 11),
                  ),
                ],
              )
            else
              const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }
}

class _SerieCard extends StatelessWidget {
  const _SerieCard({
    required this.data,
    required this.dias,
    required this.metrica,
    required this.estilo,
    required this.onMetrica,
    required this.onEstilo,
  });

  final DashboardResumen data;
  final int dias;
  final _Metrica metrica;
  final _Estilo estilo;
  final ValueChanged<_Metrica> onMetrica;
  final ValueChanged<_Estilo> onEstilo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final valores = data.series
        .map((p) => metrica == _Metrica.ventas ? p.total : p.n.toDouble())
        .toList(growable: false);
    final etiquetas = data.series.map(_etiquetaPunto).toList(growable: false);
    final vacio = data.series.isEmpty || valores.every((v) => v == 0);

    return Card(
      key: const Key('dashboard_serie_card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    dias == 1 ? 'Ventas por hora' : 'Ventas por día',
                    style: theme.textTheme.titleSmall,
                  ),
                ),
                SegmentedButton<_Metrica>(
                  key: const Key('dashboard_serie_metrica'),
                  showSelectedIcon: false,
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                  ),
                  segments: const [
                    ButtonSegment(
                      value: _Metrica.ventas,
                      label: Text('Pesos'),
                    ),
                    ButtonSegment(
                      value: _Metrica.tickets,
                      label: Text('Tickets'),
                    ),
                  ],
                  selected: {metrica},
                  onSelectionChanged: (s) => onMetrica(s.first),
                ),
                const SizedBox(width: 8),
                SegmentedButton<_Estilo>(
                  key: const Key('dashboard_serie_estilo'),
                  showSelectedIcon: false,
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                  ),
                  segments: const [
                    ButtonSegment(
                      value: _Estilo.barras,
                      icon: Icon(Icons.bar_chart, size: 16),
                    ),
                    ButtonSegment(
                      value: _Estilo.linea,
                      icon: Icon(Icons.show_chart, size: 16),
                    ),
                  ],
                  selected: {estilo},
                  onSelectionChanged: (s) => onEstilo(s.first),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (vacio)
              const SizedBox(
                height: 160,
                child: Center(child: Text('Sin movimientos en el período.')),
              )
            else
              SizedBox(
                height: 220,
                child: estilo == _Estilo.barras
                    ? _BarChart(
                        valores: valores,
                        etiquetas: etiquetas,
                        esPesos: metrica == _Metrica.ventas,
                      )
                    : _LineChart(
                        valores: valores,
                        esPesos: metrica == _Metrica.ventas,
                      ),
              ),
          ],
        ),
      ),
    );
  }

  static String _etiquetaPunto(PuntoSerie p) {
    // `2026-10-15` → `15/10`; `2026-10-15 13` → `13h`.
    final partes = p.dia.split(' ');
    if (partes.length == 2) return '${partes[1]}h';
    final ymd = p.dia.split('-');
    if (ymd.length == 3) return '${ymd[2]}/${ymd[1]}';
    return p.dia;
  }
}

class _BarChart extends StatelessWidget {
  const _BarChart({
    required this.valores,
    required this.etiquetas,
    required this.esPesos,
  });

  final List<double> valores;
  final List<String> etiquetas;
  final bool esPesos;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final maximo = valores.fold<double>(0, (a, b) => b > a ? b : a);
    // Margen del 15% arriba para que el valor no toque el borde.
    final topeY = maximo == 0 ? 1.0 : maximo * 1.15;
    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: topeY,
        borderData: FlBorderData(show: false),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: topeY / 4,
          getDrawingHorizontalLine: (_) =>
              FlLine(color: colorScheme.outlineVariant, strokeWidth: 0.5),
        ),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 46,
              interval: topeY / 4,
              getTitlesWidget: (value, meta) => Text(
                _abreviar(value),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 10,
                      color: colorScheme.onSurfaceVariant,
                    ),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= etiquetas.length) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    etiquetas[i],
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 9,
                          color: colorScheme.onSurfaceVariant,
                        ),
                  ),
                );
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipItem: (group, _, rod, _) {
              final v = rod.toY;
              return BarTooltipItem(
                esPesos ? moneda(v) : '${v.toStringAsFixed(0)} tickets',
                TextStyle(color: colorScheme.onInverseSurface, fontSize: 11),
              );
            },
          ),
        ),
        barGroups: [
          for (var i = 0; i < valores.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: valores[i],
                  width: 12,
                  color: colorScheme.primary,
                  borderRadius: BorderRadius.circular(3),
                ),
              ],
            ),
        ],
      ),
    );
  }

  static String _abreviar(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}k';
    return v.toStringAsFixed(0);
  }
}

class _LineChart extends StatelessWidget {
  const _LineChart({required this.valores, required this.esPesos});

  final List<double> valores;
  final bool esPesos;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final maximo = valores.fold<double>(0, (a, b) => b > a ? b : a);
    final topeY = maximo == 0 ? 1.0 : maximo * 1.15;
    return LineChart(
      LineChartData(
        minY: 0,
        maxY: topeY,
        borderData: FlBorderData(show: false),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: topeY / 4,
          getDrawingHorizontalLine: (_) =>
              FlLine(color: colorScheme.outlineVariant, strokeWidth: 0.5),
        ),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 46,
              interval: topeY / 4,
              getTitlesWidget: (value, meta) => Text(
                _BarChart._abreviar(value),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 10,
                      color: colorScheme.onSurfaceVariant,
                    ),
              ),
            ),
          ),
          bottomTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touched) => touched.map((spot) {
              final v = spot.y;
              return LineTooltipItem(
                esPesos ? moneda(v) : '${v.toStringAsFixed(0)} tickets',
                TextStyle(color: colorScheme.onInverseSurface, fontSize: 11),
              );
            }).toList(),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: [
              for (var i = 0; i < valores.length; i++)
                FlSpot(i.toDouble(), valores[i]),
            ],
            isCurved: true,
            color: colorScheme.primary,
            barWidth: 2.5,
            dotData: FlDotData(
              getDotPainter: (_, _, _, _) =>
                  FlDotCirclePainter(radius: 3, color: colorScheme.primary),
            ),
            belowBarData: BarAreaData(
              show: true,
              color: colorScheme.primary.withValues(alpha: 0.15),
            ),
          ),
        ],
      ),
    );
  }
}

class _FormasCard extends StatelessWidget {
  const _FormasCard({required this.formas, required this.ventas});

  final List<FormaPagoTotal> formas;
  final double ventas;

  static const _paleta = <Color>[
    Color(0xFF1E88E5),
    Color(0xFF43A047),
    Color(0xFFFB8C00),
    Color(0xFF8E24AA),
    Color(0xFFE53935),
    Color(0xFF00897B),
  ];

  @override
  Widget build(BuildContext context) {
    final total = formas.fold<double>(0, (a, f) => a + f.total);
    final theme = Theme.of(context);
    return Card(
      key: const Key('dashboard_formas_card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Por forma de pago', style: theme.textTheme.titleSmall),
            const SizedBox(height: 12),
            if (total == 0)
              const Text('Sin cobros registrados.')
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 160,
                    height: 160,
                    child: PieChart(
                      PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 32,
                        sections: [
                          for (var i = 0; i < formas.length; i++)
                            PieChartSectionData(
                              value: formas[i].total,
                              color: _paleta[i % _paleta.length],
                              radius: 44,
                              title: total > 0
                                  ? '${((formas[i].total / total) * 100).toStringAsFixed(0)}%'
                                  : '',
                              titleStyle: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < formas.length; i++)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              children: [
                                Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: _paleta[i % _paleta.length],
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _formaLabel(formas[i].formaPago),
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                ),
                                Text(
                                  '${formas[i].n} · ${moneda(formas[i].total)}',
                                  style: theme.textTheme.bodySmall
                                      ?.copyWith(fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            if (total != 0) ...[
              const SizedBox(height: 8),
              Text(
                'Total del período: ${moneda(ventas)}',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _formaLabel(String key) => switch (key) {
        'efectivo' => 'Efectivo',
        'transferencia' => 'Transferencia',
        'tarjeta' => 'Tarjeta',
        'cuenta_corriente' => 'Cuenta corriente',
        _ => key,
      };
}

class _TopCard extends StatelessWidget {
  const _TopCard({required this.top});

  final List<ProductoTop> top;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maximo = top.fold<double>(0, (a, t) => t.total > a ? t.total : a);
    final visible = top.take(5).toList();
    return Card(
      key: const Key('dashboard_top_card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Top 5 productos', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            for (final item in visible)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    SizedBox(
                      width: 120,
                      child: Text(
                        item.nombre,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, c) {
                          final fraccion =
                              maximo == 0 ? 0.0 : (item.total / maximo).clamp(0.0, 1.0);
                          return Stack(
                            children: [
                              Container(
                                height: 12,
                                decoration: BoxDecoration(
                                  color: theme
                                      .colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                              ),
                                  FractionallySizedBox(
                                widthFactor: fraccion,
                                child: Container(
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primary,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      moneda(item.total),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ColaCard extends StatelessWidget {
  const _ColaCard({required this.cola});

  final List<PedidoCola> cola;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      key: const Key('dashboard_cola_card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Cola de pedidos (${cola.length})',
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            for (final p in cola)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.circle_outlined,
                  color: _colorEstado(p.estado, theme.colorScheme),
                  size: 12,
                ),
                title: Text(p.cliente),
                subtitle: Text(
                  '${_estadoLabel(p.estado)}'
                  '${p.vendedor != null ? ' · ${p.vendedor}' : ''}',
                ),
                trailing: Text(
                  moneda(p.total),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static Color _colorEstado(String estado, ColorScheme cs) => switch (estado) {
        'enviado' => Colors.blue,
        'en_preparacion' => Colors.orange,
        'listo' => Colors.green,
        _ => cs.outline,
      };

  static String _estadoLabel(String estado) => switch (estado) {
        'enviado' => 'Enviado',
        'en_preparacion' => 'En preparación',
        'listo' => 'Listo',
        _ => estado,
      };
}

class _MovimientosCard extends StatelessWidget {
  const _MovimientosCard({required this.movimientos});

  final List<Movimiento> movimientos;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visibles = movimientos.take(10).toList();
    return Card(
      key: const Key('dashboard_movimientos_card'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Últimos movimientos',
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            for (final m in visibles)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Text(
                    m.numero?.toString() ?? '·',
                    style: TextStyle(
                      fontSize: 11,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                title: Text(m.cliente),
                subtitle: Text(
                  '${_horaCorta(m.createdAt)} · '
                  '${m.productos.isEmpty ? '—' : m.productos}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Text(
                  moneda(m.monto),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }

  /// `2026-10-16 12:34:00` → `12:34`.
  static String _horaCorta(String createdAt) {
    final partes = createdAt.split(' ');
    if (partes.length < 2) return createdAt;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}
