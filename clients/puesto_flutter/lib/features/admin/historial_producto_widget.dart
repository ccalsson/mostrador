import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/reportes.dart';
import '../../services/reportes_service.dart';

/// Widget de solo lectura que muestra el historial de ventas de un producto
/// (últimos 30 días): gráfico de líneas, tabla diaria y total acumulado.
///
/// Carga los datos de forma lazy al montarse (usa [historialProductoProvider]).
class HistorialProductoWidget extends ConsumerWidget {
  const HistorialProductoWidget({super.key, required this.productoId});

  final String productoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historial = ref.watch(historialProductoProvider(productoId));

    return historial.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.message
                    : 'No se pudo cargar el historial del producto.',
              ),
              const SizedBox(height: 12),
              FilledButton.tonal(
                key: const Key('historial_producto_reintentar'),
                onPressed: () =>
                    ref.invalidate(historialProductoProvider(productoId)),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      ),
      data: (data) {
        if (data.dias.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: Text('Sin ventas registradas en los últimos 30 días.'),
            ),
          );
        }
        return _HistorialBody(data: data);
      },
    );
  }
}

class _HistorialBody extends StatelessWidget {
  const _HistorialBody({required this.data});

  final HistorialProducto data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final totalVentas = data.dias.fold<double>(0, (a, d) => a + d.total);
    final totalCantidad = data.dias.fold<double>(0, (a, d) => a + d.cantidad);

    return SingleChildScrollView(
      key: const Key('historial_producto_contenido'),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Gráfico de líneas ──────────────────────────────────────────────
          Text(
            'Ventas diarias (últimos 30 días)',
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 180,
            child: _HistorialLineChart(dias: data.dias),
          ),
          const SizedBox(height: 16),

          // ── Tabla de detalle ───────────────────────────────────────────────
          Text('Detalle por día', style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          Table(
            key: const Key('historial_producto_tabla'),
            columnWidths: const {
              0: FlexColumnWidth(2),
              1: FlexColumnWidth(1.5),
              2: FlexColumnWidth(2),
            },
            border: TableBorder.all(
              color: theme.colorScheme.outlineVariant,
              width: 0.5,
            ),
            children: [
              TableRow(
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                ),
                children: const [
                  TableCell(
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: Text(
                        'Fecha',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  TableCell(
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: Text(
                        'Cantidad',
                        style: TextStyle(fontWeight: FontWeight.w600),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ),
                  TableCell(
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: Text(
                        'Total',
                        style: TextStyle(fontWeight: FontWeight.w600),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ),
                ],
              ),
              for (final item in data.dias)
                TableRow(
                  children: [
                    TableCell(
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Text(_formatearFecha(item.dia)),
                      ),
                    ),
                    TableCell(
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Text(
                          '${cantidadNum(item.cantidad)} u.',
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ),
                    TableCell(
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Text(
                          moneda(item.total),
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ),
                  ],
                ),
              // ── Fila de totales ────────────────────────────────────────────
              TableRow(
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
                ),
                children: [
                  const TableCell(
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: Text(
                        'Total',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                  TableCell(
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Text(
                        '${cantidadNum(totalCantidad)} u.',
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                  TableCell(
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Text(
                        moneda(totalVentas),
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Convierte `2026-10-15` en `15/10/2026`.
  static String _formatearFecha(String dia) {
    final partes = dia.split('-');
    if (partes.length == 3) return '${partes[2]}/${partes[1]}/${partes[0]}';
    return dia;
  }
}

/// Gráfico de líneas con el total diario de ventas.
class _HistorialLineChart extends StatelessWidget {
  const _HistorialLineChart({required this.dias});

  final List<HistorialVentaDia> dias;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final valores = dias.map((d) => d.total).toList(growable: false);
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
              reservedSize: 44,
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
              reservedSize: 22,
              interval: _intervaloEtiquetas(dias.length),
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= dias.length) {
                  return const SizedBox.shrink();
                }
                final partes = dias[i].dia.split('-');
                final label =
                    partes.length == 3 ? '${partes[2]}/${partes[1]}' : dias[i].dia;
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    label,
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
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touched) => touched.map((spot) {
              final idx = spot.x.toInt();
              final fecha = idx >= 0 && idx < dias.length
                  ? _formatearFechaCorta(dias[idx].dia)
                  : '';
              return LineTooltipItem(
                '$fecha\n${moneda(spot.y)}',
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
                  FlDotCirclePainter(radius: 2.5, color: colorScheme.primary),
            ),
            belowBarData: BarAreaData(
              show: true,
              color: colorScheme.primary.withValues(alpha: 0.12),
            ),
          ),
        ],
      ),
    );
  }

  /// Para 30 días muestra una etiqueta cada ~5 días para no saturar el eje.
  static double _intervaloEtiquetas(int cantidad) {
    if (cantidad <= 7) return 1;
    if (cantidad <= 15) return 2;
    return 5;
  }

  static String _formatearFechaCorta(String dia) {
    final partes = dia.split('-');
    return partes.length == 3 ? '${partes[2]}/${partes[1]}' : dia;
  }

  static String _abreviar(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}k';
    return v.toStringAsFixed(0);
  }
}
