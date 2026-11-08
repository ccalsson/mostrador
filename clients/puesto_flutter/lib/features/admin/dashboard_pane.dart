import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../models/dashboard.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import '../../services/dashboard_service.dart';
import '../../services/productos_service.dart';
import '../../services/tenant_service.dart';

/// Panel de dashboard para el admin: métricas del día/semana/mes y accesos
/// rápidos. Período seleccionable: 1, 7 o 30 días.
class DashboardPane extends ConsumerWidget {
  const DashboardPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dias = ref.watch(dashboardDiasProvider);
    final resumen = ref.watch(dashboardProvider);

    return Column(
      children: [
        // ── Selector de período ──────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Dashboard',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
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
                onSelectionChanged: (seleccion) =>
                    ref.read(dashboardDiasProvider.notifier).setDias(seleccion.first),
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
        // ── Contenido ────────────────────────────────────────────────────────
        Expanded(
          child: resumen.when(
            loading: () => const Center(child: CircularProgressIndicator()),
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
            data: (data) => _DashboardBody(data: data, dias: dias),
          ),
        ),
      ],
    );
  }
}

class _DashboardBody extends ConsumerStatefulWidget {
  const _DashboardBody({required this.data, required this.dias});

  final DashboardResumen data;
  final int dias;

  @override
  ConsumerState<_DashboardBody> createState() => _DashboardBodyState();
}

class _DashboardBodyState extends ConsumerState<_DashboardBody> {
  String? _pagoSeleccionado;

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final dias = widget.dias;
    final colorScheme = Theme.of(context).colorScheme;
    return ListView(
      key: const Key('dashboard_lista'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      children: [
        // Gap 5 - Identidad del puesto inline
        const _IdentidadCard(),
        const SizedBox(height: 12),

        // Gap 3 - Reputacion con estrellas
        _ReputacionEstrellas(promedio: data.reputacionPromedio ?? 4.5),
        const SizedBox(height: 12),

        // Tarjetas principales
        _TarjetasRow(tarjetas: [
          _TarjetaDato(clave: 'dashboard_total_ventas', icono: Icons.trending_up, titulo: 'Ventas', valor: moneda(data.totalVentas), color: colorScheme.primary),
          _TarjetaDato(clave: 'dashboard_total_cobrado', icono: Icons.payments_outlined, titulo: 'Cobrado', valor: moneda(data.totalCobrado), color: Colors.green),
        ]),
        const SizedBox(height: 12),
        _TarjetasRow(tarjetas: [
          _TarjetaDato(clave: 'dashboard_pedidos', icono: Icons.receipt_long_outlined, titulo: 'Pedidos', valor: '${data.cantidadPedidos}', color: Colors.blue),
          _TarjetaDato(clave: 'dashboard_pendientes', icono: Icons.hourglass_top_outlined, titulo: 'Pendientes', valor: '${data.pedidosPendientes}', color: data.pedidosPendientes > 0 ? Colors.orange : colorScheme.onSurfaceVariant),
        ]),
        const SizedBox(height: 12),
        _TarjetasRow(tarjetas: [
          _TarjetaDato(clave: 'dashboard_stock_bajo', icono: Icons.warning_amber_outlined, titulo: 'Stock bajo', valor: '${data.stockBajoCount}', color: data.stockBajoCount > 0 ? Colors.red : colorScheme.onSurfaceVariant),
          _TarjetaDato(clave: 'dashboard_alertas', icono: Icons.notifications_outlined, titulo: 'Alertas', valor: '${data.alertasSinLeer}', color: data.alertasSinLeer > 0 ? Colors.orange : colorScheme.onSurfaceVariant),
        ]),

        // Gap 2 - StockBoard con drag-and-drop
        const SizedBox(height: 24),
        const _StockBoard(),

        // Gap 1 - Pie chart interactivo
        if (data.porFormaPago.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('Por forma de pago', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _InteractivePieChart(
            porFormaPago: data.porFormaPago,
            seleccionado: _pagoSeleccionado,
            onSeleccion: (pago) => setState(() => _pagoSeleccionado = _pagoSeleccionado == pago ? null : pago),
          ),
          const SizedBox(height: 8),
          ...data.porFormaPago.entries.map((entry) => _FormaPagoRow(
                forma: _formaLabel(entry.key),
                monto: entry.value,
                seleccionado: _pagoSeleccionado == entry.key,
                onTap: () => setState(() => _pagoSeleccionado = _pagoSeleccionado == entry.key ? null : entry.key),
              )),
          if (_pagoSeleccionado != null) ...[
            const SizedBox(height: 8),
            _ChipFiltro(label: _formaLabel(_pagoSeleccionado!), onClear: () => setState(() => _pagoSeleccionado = null)),
          ],
        ],

        // Gap 4 - Comparar sucursales
        if (data.ventasPorSucursal.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('Comparar sucursales', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _CompararSucursalesChart(ventasPorSucursal: data.ventasPorSucursal),
        ],

        const SizedBox(height: 24),
        Text(dias == 1 ? 'Datos de hoy' : 'Datos de los ultimos $dias dias',
            textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 16),
      ],
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

class _TarjetasRow extends StatelessWidget {
  const _TarjetasRow({required this.tarjetas});

  final List<_TarjetaDato> tarjetas;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (int i = 0; i < tarjetas.length; i++) ...[
          Expanded(child: tarjetas[i]),
          if (i < tarjetas.length - 1) const SizedBox(width: 12),
        ],
      ],
    );
  }
}

class _TarjetaDato extends StatelessWidget {
  const _TarjetaDato({
    required this.clave,
    required this.icono,
    required this.titulo,
    required this.valor,
    required this.color,
  });

  final String clave;
  final IconData icono;
  final String titulo;
  final String valor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: Key(clave),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icono, size: 18, color: color),
                const SizedBox(width: 6),
                Text(
                  titulo,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              valor,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

// -- Gap 5: Identidad del puesto inline ---------------------------------------

class _IdentidadCard extends ConsumerWidget {
  const _IdentidadCard();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenant = ref.watch(tenantProvider).value;
    final tokens = context.tokens;
    final nombre = tenant?.nombre ?? 'Mostrador';
    final bajada = tenant?.bajada ?? '';
    return Card(
      key: const Key('dashboard_identidad'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: tokens.leaf, borderRadius: BorderRadius.circular(10)),
              child: Icon(Icons.storefront, color: tokens.leafFg, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(nombre, style: Theme.of(context).textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (bajada.isNotEmpty)
                    Text(bajada, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tokens.muted),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// -- Gap 3: Reputacion con estrellas ------------------------------------------

class _ReputacionEstrellas extends StatelessWidget {
  const _ReputacionEstrellas({required this.promedio});
  final double promedio;
  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final estrellas = List.generate(5, (i) {
      final limite = i + 1;
      if (promedio >= limite) return Icon(Icons.star, size: 20, color: tokens.ambar);
      if (promedio >= limite - 0.5) return Icon(Icons.star_half, size: 20, color: tokens.ambar);
      return Icon(Icons.star_border, size: 20, color: tokens.ambar);
    });
    return Card(
      key: const Key('dashboard_reputacion'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.how_to_reg_outlined, size: 18, color: tokens.muted),
            const SizedBox(width: 8),
            Text('Reputacion', style: Theme.of(context).textTheme.bodySmall),
            const Spacer(),
            ...estrellas,
            const SizedBox(width: 6),
            Text(promedio.toStringAsFixed(1),
                style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// -- Gap 1: Pie chart interactivo ---------------------------------------------

class _InteractivePieChart extends StatelessWidget {
  const _InteractivePieChart({
    required this.porFormaPago,
    required this.seleccionado,
    required this.onSeleccion,
  });
  final Map<String, double> porFormaPago;
  final String? seleccionado;
  final ValueChanged<String> onSeleccion;
  static const _colores = [Color(0xFF1B5E3B), Color(0xFFB5471A), Color(0xFFC46B14), Color(0xFFC9A227), Color(0xFF2C6B45)];
  @override
  Widget build(BuildContext context) {
    final entries = porFormaPago.entries.toList();
    final total = entries.fold<double>(0, (s, e) => s + e.value);
    final sections = <PieChartSectionData>[];
    for (var i = 0; i < entries.length; i++) {
      final entry = entries[i];
      final pct = total > 0 ? (entry.value / total * 100) : 0.0;
      final isSelected = seleccionado == entry.key;
      sections.add(PieChartSectionData(
        value: entry.value,
        color: _colores[i % _colores.length],
        radius: isSelected ? 60 : 50,
        title: pct >= 5 ? '${pct.toStringAsFixed(0)}%' : '',
        titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white),
        borderSide: isSelected ? const BorderSide(color: Colors.white, width: 3) : BorderSide.none,
      ));
    }
    return SizedBox(
      height: 200,
      child: PieChart(PieChartData(
        sections: sections,
        centerSpaceRadius: 30,
        pieTouchData: PieTouchData(touchCallback: (event, response) {
          if (event.isInterestedForInteractions && response != null && response.touchedSection != null) {
            final idx = response.touchedSection!.touchedSectionIndex;
            if (idx >= 0 && idx < entries.length) onSeleccion(entries[idx].key);
          }
        }),
      )),
    );
  }
}

// -- Gap 2: StockBoard con drag-and-drop --------------------------------------

class _StockBoard extends ConsumerStatefulWidget {
  const _StockBoard();
  @override
  ConsumerState<_StockBoard> createState() => _StockBoardState();
}

class _StockBoardState extends ConsumerState<_StockBoard> {
  String _busqueda = '';
  List<String>? _ordenPersonalizado;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final catalogo = ref.watch(catalogoProvider);
    return catalogo.when(
      loading: () => const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))),
      error: (e, _) => const SizedBox.shrink(),
      data: (cat) {
        final activos = cat.productos.where((p) => p.activo).toList();
        final lista = _ordenPersonalizado != null ? _aplicarOrden(activos, _ordenPersonalizado!) : activos;
        final q = _busqueda.trim().toLowerCase();
        final celdas = q.isNotEmpty ? lista.where((p) => p.nombre.toLowerCase().contains(q)).toList() : lista;
        final vacios = activos.where((p) => p.stock <= 0).length;
        return Card(
          key: const Key('dashboard_stock_board'),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Stock', style: Theme.of(context).textTheme.titleSmall),
                    Text('${activos.length} celdas${vacios > 0 ? ' - $vacios en cero' : ''}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tokens.muted)),
                  ])),
                  _LeyendaStock(color: tokens.leaf, texto: 'OK'),
                  const SizedBox(width: 8),
                  _LeyendaStock(color: tokens.naranja, texto: 'Medio'),
                  const SizedBox(width: 8),
                  _LeyendaStock(color: tokens.ambar, texto: 'Poco'),
                  const SizedBox(width: 8),
                  _LeyendaStock(color: tokens.alerta, texto: 'Cero'),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: TextField(
                    key: const Key('stock_buscar'),
                    onChanged: (v) => setState(() => _busqueda = v),
                    decoration: const InputDecoration(hintText: 'Buscar producto', prefixIcon: Icon(Icons.search, size: 18),
                        isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  )),
                  const SizedBox(width: 8),
                  IconButton(key: const Key('stock_agregar'), tooltip: 'Agregar producto',
                      onPressed: () => _mostrarAltaDialog(context),
                      icon: const Icon(Icons.add_circle_outline), color: tokens.leaf),
                ]),
                const SizedBox(height: 12),
                if (celdas.isEmpty)
                  Padding(padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: Text('No hay productos para mostrar.',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: tokens.muted))))
                else
                  ReorderableListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    buildDefaultDragHandles: false,
                    itemCount: celdas.length,
                    onReorderItem: (oldIndex, newIndex) {
                      setState(() {
                        final base = _ordenPersonalizado != null ? _aplicarOrden(activos, _ordenPersonalizado!) : activos;
                        final filtrada = q.isNotEmpty ? base.where((p) => p.nombre.toLowerCase().contains(q)).toList() : base;
                        final item = filtrada.removeAt(oldIndex);
                        filtrada.insert(newIndex, item);
                        _ordenPersonalizado = filtrada.map((p) => p.id).toList();
                      });
                    },
                    itemBuilder: (context, index) {
                      final producto = celdas[index];
                      return ReorderableDragStartListener(
                        key: ValueKey(producto.id), index: index,
                        child: _CeldaStock(producto: producto, tokens: tokens),
                      );
                    },
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  List<Producto> _aplicarOrden(List<Producto> activos, List<String> orden) {
    final mapa = {for (final p in activos) p.id: p};
    final resultado = <Producto>[];
    for (final id in orden) {
      final p = mapa.remove(id);
      if (p != null) resultado.add(p);
    }
    resultado.addAll(mapa.values);
    return resultado;
  }

  Future<void> _mostrarAltaDialog(BuildContext context) async {
    final nombreCtrl = TextEditingController();
    final cantidadCtrl = TextEditingController(text: '10');
    final precioCtrl = TextEditingController();
    String unidadLabel = 'cajon';
    String? error;
    final resultado = await showDialog<ProductoInput>(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(builder: (ctx, setDlg) => AlertDialog(
            title: const Text('Nuevo producto'),
            content: SizedBox(width: 400, child: SingleChildScrollView(child: Column(
                    mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  TextField(key: const Key('alta_prod_nombre'), controller: nombreCtrl,
                      decoration: const InputDecoration(labelText: 'Nombre')),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: DropdownButtonFormField<String>(initialValue: unidadLabel,
                        decoration: const InputDecoration(labelText: 'Unidad'),
                        items: const ['cajon', 'bolsa', 'atado', 'bulto', 'kg']
                            .map((u) => DropdownMenuItem(value: u, child: Text(u))).toList(),
                        onChanged: (v) => setDlg(() => unidadLabel = v ?? 'cajon'))),
                    const SizedBox(width: 12),
                    Expanded(child: TextField(key: const Key('alta_prod_cantidad'), controller: cantidadCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Cantidad'))),
                  ]),
                  const SizedBox(height: 12),
                  TextField(key: const Key('alta_prod_precio'), controller: precioCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Precio')),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                  ],
                ]))),
            actions: [
              TextButton(onPressed: () => Navigator.of(dialogCtx).pop(), child: const Text('Cancelar')),
              FilledButton(key: const Key('alta_prod_guardar'), onPressed: () {
                final nombre = nombreCtrl.text.trim();
                if (nombre.isEmpty) { setDlg(() => error = 'Nombre requerido'); return; }
                final cant = parseDecimal(cantidadCtrl.text) ?? 10;
                final precio = parseDecimal(precioCtrl.text) ?? 0;
                final uInt = unidadLabel == 'kg' ? 'kg' : 'bulto';
                final min = cant > 0 ? (uInt == 'kg' ? 0.5 : 1.0) : 1.0;
                Navigator.of(dialogCtx).pop(ProductoInput(
                    nombre: nombre, unidad: uInt, unidadLabel: unidadLabel,
                    precio: precio, stockMinimo: min, alias: const [], activo: true, stockInicial: cant));
              }, child: const Text('Sumar celda')),
            ],
          )),
    );
    nombreCtrl.dispose(); cantidadCtrl.dispose(); precioCtrl.dispose();
    if (resultado == null || !context.mounted) return;
    try {
      await ref.read(productosAdminServiceProvider).guardar(resultado);
      ref.invalidate(catalogoProvider);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Celda agregada')));
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _LeyendaStock extends StatelessWidget {
  const _LeyendaStock({required this.color, required this.texto});
  final Color color;
  final String texto;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 3),
        Text(texto, style: Theme.of(context).textTheme.labelSmall),
      ]);
}

class _CeldaStock extends StatelessWidget {
  const _CeldaStock({required this.producto, required this.tokens});
  final Producto producto;
  final TokensMostrador tokens;
  @override
  Widget build(BuildContext context) {
    final n = _nivel(producto.stock, producto.stockMinimo);
    return Padding(
      key: ValueKey(producto.id),
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: n.tono == 'out' ? tokens.alerta.withValues(alpha: 0.5) : tokens.line),
          borderRadius: BorderRadius.circular(8), color: tokens.surface),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(children: [
          ReorderableDragStartListener(index: 0,
              child: Padding(padding: const EdgeInsets.only(right: 6),
                  child: Icon(Icons.drag_handle, size: 16, color: tokens.muted))),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(producto.nombre, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('${cantidadNum(producto.stock)} ${producto.unidadLabel}',
                style: Theme.of(context).textTheme.labelSmall),
          ])),
          _MedidorStock(pct: n.pct, color: n.color),
        ]),
      ),
    );
  }

  static ({double pct, String tono, Color color}) _nivel(double stock, double minimo) {
    if (stock <= 0) return (pct: 100.0, tono: 'out', color: const Color(0xFF9B2330));
    final cap = (minimo > 0 ? minimo : 1) * 4;
    final ratio = stock / cap;
    final pct = (ratio * 100).clamp(8, 100).roundToDouble();
    if (ratio > 0.5) return (pct: pct, tono: 'ok', color: const Color(0xFF1B5E3B));
    if (ratio > 0.25) return (pct: pct, tono: 'mid', color: const Color(0xFFC46B14));
    return (pct: pct, tono: 'low', color: const Color(0xFFC9A227));
  }
}

class _MedidorStock extends StatelessWidget {
  const _MedidorStock({required this.pct, required this.color});
  final double pct;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(width: 8, height: 32,
      child: ClipRRect(borderRadius: BorderRadius.circular(4),
          child: Stack(children: [
            Container(color: Colors.grey.withValues(alpha: 0.15)),
            Align(alignment: Alignment.bottomCenter, child: Container(height: 32 * pct / 100, color: color)),
          ])));
}

// -- Gap 4: Comparar sucursales -----------------------------------------------

class _CompararSucursalesChart extends StatelessWidget {
  const _CompararSucursalesChart({required this.ventasPorSucursal});
  final Map<String, double> ventasPorSucursal;
  static const _colores = [Color(0xFF1B5E3B), Color(0xFFB5471A), Color(0xFFC46B14), Color(0xFFC9A227), Color(0xFF2C6B45)];
  @override
  Widget build(BuildContext context) {
    final entries = ventasPorSucursal.entries.toList();
    final maxVal = entries.fold<double>(0, (m, e) => e.value > m ? e.value : m);
    final groups = <BarChartGroupData>[
      for (var i = 0; i < entries.length; i++)
        BarChartGroupData(x: i, barRods: [
          BarChartRodData(toY: entries[i].value, color: _colores[i % _colores.length], width: 18,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(4))),
        ]),
    ];
    return Card(
      key: const Key('dashboard_comparar_sucursales'),
      child: Padding(padding: const EdgeInsets.all(16), child: Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(height: 200, child: BarChart(BarChartData(
            alignment: BarChartAlignment.spaceAround, maxY: maxVal * 1.2,
            barTouchData: BarTouchData(enabled: true, touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => Theme.of(context).colorScheme.surface,
              getTooltipItem: (g, gi, r, ri) {
                final e = entries[g.x];
                return BarTooltipItem('${e.key}\n${moneda(e.value)}',
                    TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 12, fontWeight: FontWeight.w600));
              })),
            titlesData: FlTitlesData(
              leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (v, _) {
                final idx = v.toInt();
                return idx >= 0 && idx < entries.length
                    ? Padding(padding: const EdgeInsets.only(top: 4),
                        child: Text(entries[idx].key, style: Theme.of(context).textTheme.labelSmall,
                            maxLines: 1, overflow: TextOverflow.ellipsis))
                    : const SizedBox.shrink();
              })),
            ),
            borderData: FlBorderData(show: false),
            gridData: const FlGridData(show: false),
            barGroups: groups,
          ))),
          const SizedBox(height: 12),
          Wrap(spacing: 12, runSpacing: 4, children: [
            for (var i = 0; i < entries.length; i++)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 10, height: 10,
                    decoration: BoxDecoration(color: _colores[i % _colores.length], borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 4),
                Text('${entries[i].key}: ${moneda(entries[i].value)}',
                    style: Theme.of(context).textTheme.labelSmall),
              ]),
          ]),
        ])),
    );
  }
}

// -- Chip de filtro activo -----------------------------------------------------

class _ChipFiltro extends StatelessWidget {
  const _ChipFiltro({required this.label, required this.onClear});
  final String label;
  final VoidCallback onClear;
  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: tokens.okBg, borderRadius: BorderRadius.circular(20)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: tokens.ok, fontWeight: FontWeight.w600)),
            const SizedBox(width: 4),
            GestureDetector(onTap: onClear, child: Icon(Icons.close, size: 14, color: tokens.ok)),
          ])),
    ]);
  }
}

class _FormaPagoRow extends StatelessWidget {
  const _FormaPagoRow({required this.forma, required this.monto, this.seleccionado = false, this.onTap});
  final String forma;
  final double monto;
  final bool seleccionado;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final contenido = Padding(padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
        child: Row(children: [Expanded(child: Text(forma)), Text(moneda(monto), style: const TextStyle(fontWeight: FontWeight.w600))]));
    if (onTap == null) return contenido;
    return GestureDetector(onTap: onTap,
        child: Container(
            decoration: seleccionado
                ? BoxDecoration(color: tokens.okBg, borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: tokens.leaf, width: 1.5))
                : null,
            child: contenido));
  }
}
