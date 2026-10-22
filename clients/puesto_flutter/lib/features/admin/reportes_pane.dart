import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/reportes.dart';
import '../../services/reportes_service.dart';

enum _SeccionReporte {
  productos,
  cargadores,
}

/// Panel de Reportes y Ranking para el rol Administrador.
/// Expone:
/// - Ventas de productos (7 y 30 días) con historial diario por producto.
/// - Ranking de cargadores activos según entregas y calificación de Mercado.
class ReportesPane extends ConsumerStatefulWidget {
  const ReportesPane({super.key});

  @override
  ConsumerState<ReportesPane> createState() => _ReportesPaneState();
}

class _ReportesPaneState extends ConsumerState<ReportesPane> {
  _SeccionReporte _seccion = _SeccionReporte.productos;
  int _diasProductos = 7;
  String? _productoSeleccionadoId;
  String? _productoSeleccionadoNombre;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Cabecera y Selector de Sección ─────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: SegmentedButton<_SeccionReporte>(
                  key: const Key('reportes_seccion_selector'),
                  segments: const [
                    ButtonSegment(
                      value: _SeccionReporte.productos,
                      label: Text('Más vendidos'),
                      icon: Icon(Icons.leaderboard_outlined),
                    ),
                    ButtonSegment(
                      value: _SeccionReporte.cargadores,
                      label: Text('Ranking cargadores'),
                      icon: Icon(Icons.electric_moped_outlined),
                    ),
                  ],
                  selected: {_seccion},
                  onSelectionChanged: (seleccion) {
                    setState(() {
                      _seccion = seleccion.first;
                    });
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('reportes_refresh'),
                tooltip: 'Actualizar',
                onPressed: () {
                  ref.invalidate(reporteProductosProvider);
                  ref.invalidate(rankingCargadoresProvider);
                  if (_productoSeleccionadoId != null) {
                    ref.invalidate(
                      historialProductoProvider(_productoSeleccionadoId!),
                    );
                  }
                },
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),

        // ── Contenido de la Sección Activa ────────────────────────────────────
        Expanded(
          child: switch (_seccion) {
            _SeccionReporte.productos => _SeccionProductos(
                dias: _diasProductos,
                onDiasChanged: (dias) => setState(() => _diasProductos = dias),
                productoSeleccionadoId: _productoSeleccionadoId,
                productoSeleccionadoNombre: _productoSeleccionadoNombre,
                onSeleccionarProducto: (id, nombre) {
                  setState(() {
                    if (_productoSeleccionadoId == id) {
                      _productoSeleccionadoId = null;
                      _productoSeleccionadoNombre = null;
                    } else {
                      _productoSeleccionadoId = id;
                      _productoSeleccionadoNombre = nombre;
                    }
                  });
                },
              ),
            _SeccionReporte.cargadores => const _SeccionRankingCargadores(),
          },
        ),
      ],
    );
  }
}

class _SeccionProductos extends ConsumerWidget {
  const _SeccionProductos({
    required this.dias,
    required this.onDiasChanged,
    required this.productoSeleccionadoId,
    required this.productoSeleccionadoNombre,
    required this.onSeleccionarProducto,
  });

  final int dias;
  final ValueChanged<int> onDiasChanged;
  final String? productoSeleccionadoId;
  final String? productoSeleccionadoNombre;
  final void Function(String id, String nombre) onSeleccionarProducto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estado = ref.watch(reporteProductosProvider);

    return estado.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              error is ApiException
                  ? error.message
                  : 'No se pudieron cargar los reportes de productos.',
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              key: const Key('reportes_productos_reintentar'),
              onPressed: () => ref.invalidate(reporteProductosProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (data) {
        final lista = dias == 7 ? data.semana : data.mes;

        return ListView(
          key: const Key('reportes_productos_lista'),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          children: [
            // Selector de período 7d / 30d
            Row(
              children: [
                Text(
                  'Período analizado:',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const Spacer(),
                SegmentedButton<int>(
                  key: const Key('reportes_periodo_selector'),
                  segments: const [
                    ButtonSegment(value: 7, label: Text('7 días')),
                    ButtonSegment(value: 30, label: Text('30 días')),
                  ],
                  selected: {dias},
                  onSelectionChanged: (seleccion) =>
                      onDiasChanged(seleccion.first),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (lista.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text('No hay ventas registradas en este período.'),
                ),
              )
            else
              Card(
                clipBehavior: Clip.antiAlias,
                child: ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: lista.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final fila = lista[index];
                    final seleccionado =
                        productoSeleccionadoId == fila.productoId;

                    return ListTile(
                      key: Key('reportes_producto_tile_${fila.productoId}'),
                      selected: seleccionado,
                      leading: CircleAvatar(
                        radius: 14,
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      title: Text(
                        fila.nombre,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '${cantidadNum(fila.cantidad)} unidades vendidas',
                      ),
                      trailing: Text(
                        moneda(fila.total),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      onTap: () => onSeleccionarProducto(
                        fila.productoId,
                        fila.nombre,
                      ),
                    );
                  },
                ),
              ),

            // Detalle de historial diario si hay un producto seleccionado
            if (productoSeleccionadoId != null) ...[
              const SizedBox(height: 24),
              _DetalleHistorialProducto(
                productoId: productoSeleccionadoId!,
                nombre: productoSeleccionadoNombre ?? 'Producto',
              ),
            ],
          ],
        );
      },
    );
  }
}

class _DetalleHistorialProducto extends ConsumerWidget {
  const _DetalleHistorialProducto({
    required this.productoId,
    required this.nombre,
  });

  final String productoId;
  final String nombre;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historial = ref.watch(historialProductoProvider(productoId));
    final theme = Theme.of(context);

    return Card(
      key: const Key('reportes_historial_card'),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.history, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Historial últimos 7 días · $nombre',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            historial.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, _) => Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    error is ApiException
                        ? error.message
                        : 'No se pudo cargar el historial del producto.',
                  ),
                ),
              ),
              data: (data) {
                if (data.dias.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(
                      child: Text('Sin datos registrados en los últimos 7 días.'),
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _HistorialBarChart(dias: data.dias),
                    const SizedBox(height: 12),
                    ListView.separated(
                      key: const Key('reportes_historial_lista'),
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: data.dias.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = data.dias[index];
                        // Formato fecha DD/MM
                        final partes = item.dia.split('-');
                        final fechaLabel = partes.length == 3
                            ? '${partes[2]}/${partes[1]}'
                            : item.dia;

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            children: [
                              Text(
                                fechaLabel,
                                style:
                                    const TextStyle(fontWeight: FontWeight.w500),
                              ),
                              const Spacer(),
                              Text(
                                '${cantidadNum(item.cantidad)} u.',
                                style: theme.textTheme.bodyMedium,
                              ),
                              const SizedBox(width: 16),
                              Text(
                                moneda(item.total),
                                style:
                                    const TextStyle(fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SeccionRankingCargadores extends ConsumerWidget {
  const _SeccionRankingCargadores();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estado = ref.watch(rankingCargadoresProvider);
    final theme = Theme.of(context);

    return estado.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              error is ApiException
                  ? error.message
                  : 'No se pudo cargar el ranking de cargadores.',
            ),
            const SizedBox(height: 16),
            FilledButton.tonal(
              key: const Key('reportes_cargadores_reintentar'),
              onPressed: () => ref.invalidate(rankingCargadoresProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (data) {
        return ListView(
          key: const Key('ranking_cargadores_lista'),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          children: [
            // Banner informativo: no se recalcula en mostrador
            Card(
              color: theme.colorScheme.surfaceContainerHighest,
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 20,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'El puntaje lo calcula Mercado con las entregas y la calificación del comprador. '
                        'Se muestra aquí como referencia sin recalcularlo.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            if (data.ranking.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text('Todavía no hay cargadores activos.'),
                ),
              )
            else
              Card(
                clipBehavior: Clip.antiAlias,
                child: ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: data.ranking.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final item = data.ranking[index];

                    return ListTile(
                      key: Key('ranking_cargador_tile_${item.puesto}'),
                      leading: CircleAvatar(
                        backgroundColor: switch (item.puesto) {
                          1 => Colors.amber.shade200,
                          2 => Colors.blueGrey.shade100,
                          3 => Colors.brown.shade200,
                          _ => theme.colorScheme.surfaceContainerHigh,
                        },
                        foregroundColor: switch (item.puesto) {
                          1 => Colors.amber.shade900,
                          2 => Colors.blueGrey.shade900,
                          3 => Colors.brown.shade900,
                          _ => theme.colorScheme.onSurfaceVariant,
                        },
                        child: Text(
                          '#${item.puesto}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(
                        item.nombre,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        'Nivel: ${item.nivel} · ${item.recorridosCompletados} entregas · ${item.puntos} pts',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.star, size: 16, color: Colors.amber),
                          const SizedBox(width: 4),
                          Text(
                            item.score.toStringAsFixed(1),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Barras verticales del total diario (7 días) del producto seleccionado.
class _HistorialBarChart extends StatelessWidget {
  const _HistorialBarChart({required this.dias});

  final List<HistorialVentaDia> dias;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final valores = dias.map((d) => d.total).toList(growable: false);
    final maximo = valores.fold<double>(0, (a, b) => b > a ? b : a);
    final topeY = maximo == 0 ? 1.0 : maximo * 1.15;

    return SizedBox(
      key: const Key('reportes_historial_chart'),
      height: 180,
      child: BarChart(
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
                getTitlesWidget: (value, meta) {
                  final i = value.toInt();
                  if (i < 0 || i >= dias.length) {
                    return const SizedBox.shrink();
                  }
                  final partes = dias[i].dia.split('-');
                  final label = partes.length == 3
                      ? '${partes[2]}/${partes[1]}'
                      : dias[i].dia;
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
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipItem: (group, _, rod, _) => BarTooltipItem(
                '${dias[group.x].nombreTooltip}\n${moneda(rod.toY)}',
                TextStyle(
                  color: colorScheme.onInverseSurface,
                  fontSize: 11,
                ),
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < valores.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: valores[i],
                    width: 14,
                    color: colorScheme.primary,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  static String _abreviar(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}k';
    return v.toStringAsFixed(0);
  }
}

extension on HistorialVentaDia {
  String get nombreTooltip {
    final partes = dia.split('-');
    return partes.length == 3 ? '${partes[2]}/${partes[1]}' : dia;
  }
}
