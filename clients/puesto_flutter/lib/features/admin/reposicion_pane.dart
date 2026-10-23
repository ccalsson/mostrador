import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../services/reposicion_service.dart';

/// Panel de reposición sugerida según historial de ventas.
///
/// Muestra una tabla con columnas: Producto, Stock Actual, Promedio Diario,
/// Cantidad Sugerida. Permite seleccionar el período (7/14/30 días) y
/// refrescar los datos. Los productos críticos (cantidad sugerida > 2x
/// promedio diario) se resaltan visualmente.
class ReposicionPane extends ConsumerStatefulWidget {
  const ReposicionPane({super.key});

  @override
  ConsumerState<ReposicionPane> createState() => _ReposicionPaneState();
}

class _ReposicionPaneState extends ConsumerState<ReposicionPane> {
  int _dias = 7;

  @override
  Widget build(BuildContext context) {
    final resultado = ref.watch(reposicionProvider(_dias));
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Cabecera con selector de período y botón refrescar ─────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: SegmentedButton<int>(
                  key: const Key('reposicion_periodo_selector'),
                  segments: const [
                    ButtonSegment(value: 7, label: Text('7 días')),
                    ButtonSegment(value: 14, label: Text('14 días')),
                    ButtonSegment(value: 30, label: Text('30 días')),
                  ],
                  selected: {_dias},
                  onSelectionChanged: (seleccion) {
                    setState(() => _dias = seleccion.first);
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                key: const Key('reposicion_refresh'),
                tooltip: 'Refrescar',
                onPressed: () => ref.invalidate(reposicionProvider(_dias)),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),

        // ── Contenido ───────────────────────────────────────────────────────
        Expanded(
          child: resultado.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    error is ApiException
                        ? error.message
                        : 'No se pudieron cargar las sugerencias de reposición.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    key: const Key('reposicion_reintentar'),
                    onPressed: () =>
                        ref.invalidate(reposicionProvider(_dias)),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (data) {
              if (data.sugerencias.isEmpty) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'No hay sugerencias de reposición para este período. '
                      'Todos los productos tienen stock suficiente.',
                      key: Key('reposicion_vacia'),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }

              final criticos =
                  data.sugerencias.where((s) => s.esCritico).length;

              return ListView(
                key: const Key('reposicion_lista'),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                children: [
                  // Banner resumen
                  Card(
                    color: theme.colorScheme.surfaceContainerHighest,
                    elevation: 0,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            size: 20,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Sugerencia basada en ventas de los últimos '
                              '${data.dias} días. Cantidad sugerida = '
                              'promedio diario x 7 menos stock actual.',
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (criticos > 0) ...[
                    const SizedBox(height: 8),
                    Card(
                      color: Colors.red.shade50,
                      elevation: 0,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Icon(
                              Icons.warning_amber_rounded,
                              size: 20,
                              color: Colors.red.shade700,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '$criticos producto${criticos == 1 ? '' : 's'} '
                              'crítico${criticos == 1 ? '' : 's'}',
                              style: TextStyle(
                                color: Colors.red.shade700,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),

                  // Tabla
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Table(
                      columnWidths: const {
                        0: FlexColumnWidth(3),
                        1: FlexColumnWidth(1.2),
                        2: FlexColumnWidth(1.2),
                        3: FlexColumnWidth(1.5),
                      },
                      children: [
                        // Encabezado
                        TableRow(
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerHigh,
                          ),
                          children: [
                            _celdaTabla(
                              'Producto',
                              theme,
                              negrita: true,
                            ),
                            _celdaTabla('Stock', theme,
                                negrita: true, centrado: true),
                            _celdaTabla('Prom./día', theme,
                                negrita: true, centrado: true),
                            _celdaTabla('Sugerido', theme,
                                negrita: true, centrado: true),
                          ],
                        ),
                        // Filas
                        for (final sug in data.sugerencias)
                          TableRow(
                            decoration: sug.esCritico
                                ? BoxDecoration(
                                    color: Colors.red.shade50,
                                  )
                                : null,
                            children: [
                              _celdaTabla(
                                sug.nombre,
                                theme,
                                sufijo: sug.esCritico
                                    ? Icon(
                                        Icons.warning_amber_rounded,
                                        size: 14,
                                        color: Colors.red.shade700,
                                      )
                                    : null,
                              ),
                              _celdaTabla(
                                cantidadNum(sug.stockActual),
                                theme,
                                centrado: true,
                              ),
                              _celdaTabla(
                                cantidadNum(sug.promedioDiario),
                                theme,
                                centrado: true,
                              ),
                              _celdaTabla(
                                cantidadNum(sug.cantidadSugerida),
                                theme,
                                centrado: true,
                                negrita: true,
                                color: sug.esCritico
                                    ? Colors.red.shade700
                                    : null,
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

Widget _celdaTabla(
  String texto,
  ThemeData theme, {
  bool negrita = false,
  bool centrado = false,
  Color? color,
  Widget? sufijo,
}) {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    child: Row(
      mainAxisAlignment:
          centrado ? MainAxisAlignment.center : MainAxisAlignment.start,
      children: [
        Flexible(
          child: Text(
            texto,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: negrita ? FontWeight.w600 : FontWeight.w400,
              color: color,
            ),
          ),
        ),
        if (sufijo != null) ...[
          const SizedBox(width: 4),
          sufijo,
        ],
      ],
    ),
  );
}
