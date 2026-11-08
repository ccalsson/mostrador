import 'dart:async';
import 'dart:convert';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../models/dashboard.dart';
import '../../models/producto.dart';
import '../../services/alertas_service.dart';
import '../../services/caja_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/dashboard_service.dart';
import '../../services/reportes_service.dart';
import '../../services/sucursales_service.dart';
import '../caja/ticket_dialog.dart';

enum _Metrica { pesos, tickets }

enum _Estilo { barras, linea, area }

/// Tablero del dueño: replica la composición de `repoweb/src/routes/dashboard.tsx`.
///
/// Fila de controles (En vivo + clima/dólar + tres `Seg`), una única tarjeta
/// de KPIs 2×2 con divisores (`.puesto-kpis` de la web), el gráfico de 256 px,
/// Stock | Movimientos en dos columnas y un riel de Cola | Productos. El
/// bloque de título y la mesa del turno los aporta el shell, no este panel.
///
/// Períodos: hoy (serie horaria, autorefresh 2 s), 7 días y 30 días.
class DashboardPane extends ConsumerStatefulWidget {
  const DashboardPane({super.key});

  @override
  ConsumerState<DashboardPane> createState() => _DashboardPaneState();
}

class _DashboardPaneState extends ConsumerState<DashboardPane> {
  _Metrica _metrica = _Metrica.pesos;
  _Estilo _estilo = _Estilo.barras;
  bool _verCola = false;
  Timer? _ticker;

  // Filtros combinados (gap 5: drill-down desde gráfico + chips).
  String? _dia;
  String? _pago;
  String? _producto;

  // Polling de alertas integrado (gap 2: 4 s).
  Timer? _alertasTicker;

  @override
  void initState() {
    super.initState();
    _reprogramarTicker();
    _alertasTicker = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      ref.invalidate(alertasProvider);
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _alertasTicker?.cancel();
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (vivo) const _EnVivo(),
            const _ClimaDolar(),
            _Seg<int>(
              key: const Key('dashboard_periodo'),
              value: dias,
              options: const [(1, 'Hoy'), (7, '7 días'), (30, '30 días')],
              onChanged: (v) {
                ref.read(dashboardDiasProvider.notifier).setDias(v);
                setState(() => _verCola = false);
                _reprogramarTicker();
              },
            ),
            _Seg<_Estilo>(
              key: const Key('dashboard_serie_estilo'),
              value: _estilo,
              options: const [
                (_Estilo.barras, 'Barras'),
                (_Estilo.linea, 'Línea'),
                (_Estilo.area, 'Área'),
              ],
              onChanged: (v) => setState(() => _estilo = v),
            ),
            _Seg<_Metrica>(
              key: const Key('dashboard_serie_metrica'),
              value: _metrica,
              options: const [
                (_Metrica.pesos, 'Pesos'),
                (_Metrica.tickets, 'Tickets'),
              ],
              onChanged: (v) => setState(() => _metrica = v),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.only(left: 2),
          child: Text(
            dias == 1 ? 'Datos de hoy' : 'Datos de los últimos $dias días',
            style: TextStyle(fontSize: 12, color: context.tokens.muted),
          ),
        ),
        const SizedBox(height: 12),
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
            data: (data) => _DashboardBody(
              data: data,
              dias: dias,
              metrica: _metrica,
              estilo: _estilo,
              verCola: _verCola,
              dia: _dia,
              pago: _pago,
              producto: _producto,
              onMetrica: (m) => setState(() => _metrica = m),
              onVerCola: () => setState(() => _verCola = !_verCola),
              onBarTap: (d) => setState(() {
                _dia = _dia == d ? null : d;
                _verCola = false;
              }),
              onProductoTap: (nombre) => setState(() {
                _producto = _producto == nombre ? null : nombre;
              }),
              onPagoTap: (fp) => setState(() {
                _pago = _pago == fp ? null : fp;
              }),
              onClearDia: () => setState(() => _dia = null),
              onClearPago: () => setState(() => _pago = null),
              onClearProducto: () => setState(() => _producto = null),
            ),
          ),
        ),
      ],
    );
  }
}

/// Píldora "En vivo" (punto ok + texto) con animación pulse, como el
/// indicador de la web (`animate-pulse rounded-full bg-ok`).
class _EnVivo extends StatefulWidget {
  const _EnVivo();

  @override
  State<_EnVivo> createState() => _EnVivoState();
}

class _EnVivoState extends State<_EnVivo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final opacidad = 0.4 + 0.6 * _ctrl.value;
        final escala = 0.85 + 0.15 * _ctrl.value;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Transform.scale(
              scale: escala,
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: tokens.ok.withValues(alpha: opacidad),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              'En vivo',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: tokens.ok,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Control segmentado estilo web (`Seg` de dashboard.tsx): fondo paper-2,
/// píldoras de 32 px, la activa sobre surface con sombra suave.
class _Seg<T> extends StatelessWidget {
  const _Seg({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.paper2,
        borderRadius: BorderRadius.circular(6),
      ),
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (id, label) in options)
            _SegBoton(
              label: label,
              activo: id == value,
              onTap: () => onChanged(id),
            ),
        ],
      ),
    );
  }
}

class _SegBoton extends StatelessWidget {
  const _SegBoton({
    required this.label,
    required this.activo,
    required this.onTap,
  });

  final String label;
  final bool activo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: activo ? tokens.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: activo
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 2,
                    offset: const Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: activo ? tokens.ink : tokens.muted,
          ),
        ),
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
    required this.verCola,
    required this.dia,
    required this.pago,
    required this.producto,
    required this.onMetrica,
    required this.onVerCola,
    required this.onBarTap,
    required this.onProductoTap,
    required this.onPagoTap,
    required this.onClearDia,
    required this.onClearPago,
    required this.onClearProducto,
  });

  final DashboardResumen data;
  final int dias;
  final _Metrica metrica;
  final _Estilo estilo;
  final bool verCola;
  final String? dia;
  final String? pago;
  final String? producto;
  final ValueChanged<_Metrica> onMetrica;
  final VoidCallback onVerCola;
  final ValueChanged<String> onBarTap;
  final ValueChanged<String> onProductoTap;
  final ValueChanged<String> onPagoTap;
  final VoidCallback onClearDia;
  final VoidCallback onClearPago;
  final VoidCallback onClearProducto;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final ancho = constraints.maxWidth >= 820;
        final hayFiltros = dia != null || pago != null || producto != null;
        return ListView(
          key: const Key('dashboard_lista'),
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            // Gap 1: Vitrina (slider productos destacados + trial).
            _VitrinaCard(
              trial: data.trial,
              productos: data.top.take(3).toList(),
              onProducto: onProductoTap,
            ),
            const SizedBox(height: 16),
            _KpiCard(
              data: data,
              dias: dias,
              verCola: verCola,
              onMetrica: onMetrica,
              onVerCola: onVerCola,
            ),
            const SizedBox(height: 16),
            const _TurnoCard(),
            const SizedBox(height: 16),
            // Gap 4: Sucursales mini-widget.
            const _SucursalesCard(),
            const SizedBox(height: 16),
            _GraficoCard(
              data: data,
              dias: dias,
              metrica: metrica,
              estilo: estilo,
              diaSeleccionada: dia,
              onBarTap: onBarTap,
            ),
            // Gap 5: Chips de filtros combinados.
            if (hayFiltros)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _FiltroChips(
                  dias: dias,
                  dia: dia,
                  pago: pago,
                  producto: producto,
                  onClearDia: onClearDia,
                  onClearPago: onClearPago,
                  onClearProducto: onClearProducto,
                ),
              ),
            const SizedBox(height: 16),
            if (ancho)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(flex: 3, child: _StockBoardCard()),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: _MovimientosCard(
                      movimientos: data.movimientos,
                      cola: data.cola,
                      verCola: verCola,
                      dia: dia,
                      pago: pago,
                      producto: producto,
                    ),
                  ),
                ],
              )
            else ...[
              const _StockBoardCard(),
              const SizedBox(height: 16),
              _MovimientosCard(
                movimientos: data.movimientos,
                cola: data.cola,
                verCola: verCola,
                dia: dia,
                pago: pago,
                producto: producto,
              ),
            ],
            const SizedBox(height: 16),
            // Riel inferior: 5 tarjetas como la web
            // (Cola | Medios | Alertas | Productos | Cargadores).
            if (ancho)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _RailCola(
                      cola: data.cola,
                      enCola: data.enCola,
                      verCola: verCola,
                      onVerCola: onVerCola,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _MediosRailCard(
                      formas: data.formas,
                      activo: pago,
                      onPick: onPagoTap,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(child: _AlertasCard()),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _RailProductos(
                      top: data.top,
                      activo: producto,
                      onPick: onProductoTap,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(child: _RankingCargadoresCard()),
                ],
              )
            else ...[
              _RailCola(
                cola: data.cola,
                enCola: data.enCola,
                verCola: verCola,
                onVerCola: onVerCola,
              ),
              const SizedBox(height: 12),
              _MediosRailCard(
                formas: data.formas,
                activo: pago,
                onPick: onPagoTap,
              ),
              const SizedBox(height: 12),
              const _AlertasCard(),
              const SizedBox(height: 12),
              _RailProductos(
                top: data.top,
                activo: producto,
                onPick: onProductoTap,
              ),
              const SizedBox(height: 12),
              const _RankingCargadoresCard(),
            ],
          ],
        );
      },
    );
  }
}

/// Tarjeta única de KPIs 2×2 con divisores en cruz y borde izquierdo de tono
/// (`border-l-4` de la web). Ventas/Tickets fijan la métrica del gráfico;
/// "En cola" alterna la cola en el panel de movimientos.
class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.data,
    required this.dias,
    required this.verCola,
    required this.onMetrica,
    required this.onVerCola,
  });

  final DashboardResumen data;
  final int dias;
  final bool verCola;
  final ValueChanged<_Metrica> onMetrica;
  final VoidCallback onVerCola;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final rangoLabel = dias == 1 ? 'hoy' : '$dias días';
    final deltaVentas = data.ventas - data.ventasPrev;
    final deltaTickets = data.tickets - data.ticketsPrev;

    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _celda(
                    context,
                    etiqueta: 'Ventas · $rangoLabel',
                    valor: moneda(data.ventas),
                    valorKey: const Key('dashboard_total_ventas'),
                    clave: const Key('dashboard_kpi_ventas'),
                    pista: '${_conSigno(deltaVentas, moneda)} vs el anterior',
                    onTap: () => onMetrica(_Metrica.pesos),
                    tonoBorder: tokens.leaf,
                    tonoFondo: tokens.okBg,
                  ),
                ),
                _divisorVertical(tokens),
                Expanded(
                  child: _celda(
                    context,
                    etiqueta: 'Tickets',
                    valor: '${data.tickets}',
                    clave: const Key('dashboard_kpi_tickets'),
                    pista: '${_conSignoInt(deltaTickets)} vs el anterior',
                    onTap: () => onMetrica(_Metrica.tickets),
                    tonoBorder: tokens.terra,
                    tonoFondo: tokens.warnBg,
                  ),
                ),
              ],
            ),
          ),
          Container(height: 1, color: tokens.line),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _celda(
                    context,
                    etiqueta: 'Ticket promedio',
                    valor: moneda(data.ticketPromedio),
                    clave: const Key('dashboard_kpi_ticket_promedio'),
                    pista: '${data.tickets} cobrados',
                    tonoBorder: tokens.naranja,
                    tonoFondo: tokens.naranja.withValues(alpha: 0.10),
                  ),
                ),
                _divisorVertical(tokens),
                Expanded(
                  child: _celda(
                    context,
                    etiqueta: 'En cola',
                    valor: '${data.enCola}',
                    clave: const Key('dashboard_kpi_cola'),
                    pista:
                        verCola ? 'Abajo está la cola' : 'Tocá para verla abajo',
                    onTap: onVerCola,
                    tonoBorder: tokens.ambar,
                    tonoFondo: tokens.ambar.withValues(alpha: 0.15),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Widget _divisorVertical(TokensMostrador tokens) =>
      Container(width: 1, color: tokens.line);

  Widget _celda(
    BuildContext context, {
    required String etiqueta,
    required String valor,
    required String pista,
    required Key clave,
    required Color tonoBorder,
    required Color tonoFondo,
    Key? valorKey,
    VoidCallback? onTap,
  }) {
    final tokens = context.tokens;
    final contenido = Container(
      key: clave,
      decoration: BoxDecoration(
        border: Border(left: BorderSide(color: tonoBorder, width: 4)),
        color: tonoFondo,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Text(
            etiqueta.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: 1.2,
              color: tokens.muted,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            valor,
            key: valorKey,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: 'Fraunces',
              fontSize: 24,
              fontWeight: FontWeight.w600,
              height: 1.0,
              letterSpacing: -0.3,
            ).copyWith(color: tokens.ink),
          ),
          const SizedBox(height: 6),
          Text(
            pista,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, color: tokens.muted),
          ),
        ],
      ),
    );
    if (onTap == null) return contenido;
    return InkWell(onTap: onTap, child: contenido);
  }

  static String _conSigno(double v, String Function(double) fmt) =>
      '${v >= 0 ? '+' : '-'}${fmt(v.abs())}';

  static String _conSignoInt(int v) => '${v >= 0 ? '+' : '-'}${v.abs()}';
}

/// Gráfico de la serie (tarjeta de 256 px, como el `h-64` de la web).
/// Gap 5: tap en barra → filtra por día.
class _GraficoCard extends StatelessWidget {
  const _GraficoCard({
    required this.data,
    required this.dias,
    required this.metrica,
    required this.estilo,
    required this.diaSeleccionada,
    required this.onBarTap,
  });

  final DashboardResumen data;
  final int dias;
  final _Metrica metrica;
  final _Estilo estilo;
  final String? diaSeleccionada;
  final ValueChanged<String> onBarTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final valores = data.series
        .map((p) => metrica == _Metrica.pesos ? p.total : p.n.toDouble())
        .toList(growable: false);
    final etiquetas = data.series.map(_etiquetaPunto).toList(growable: false);
    final vacio = data.series.isEmpty || valores.every((v) => v == 0);
    final esPesos = metrica == _Metrica.pesos;
    final titulo = dias == 1
        ? (esPesos ? 'Ventas por hora' : 'Tickets por hora')
        : (esPesos ? 'Ventas' : 'Tickets');

    return Container(
      key: const Key('dashboard_serie_card'),
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  titulo,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: tokens.ink,
                  ),
                ),
              ),
              Text(
                'Tocá una barra para filtrar.',
                style: TextStyle(fontSize: 11, color: tokens.muted),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 256,
            child: vacio
                ? Center(
                    child: Text(
                      'Sin movimientos en el período.',
                      style: TextStyle(fontSize: 13, color: tokens.muted),
                    ),
                  )
                : switch (estilo) {
                    _Estilo.barras => _BarChart(
                        valores: valores,
                        etiquetas: etiquetas,
                        esPesos: esPesos,
                        diaSeleccionada: diaSeleccionada,
                        series: data.series,
                        onBarTap: onBarTap,
                      ),
                    _Estilo.linea => _LineChart(
                        valores: valores,
                        esPesos: esPesos,
                      ),
                    _Estilo.area => _LineChart(
                        valores: valores,
                        esPesos: esPesos,
                        relleno: true,
                      ),
                  },
          ),
        ],
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
    required this.diaSeleccionada,
    required this.series,
    required this.onBarTap,
  });

  final List<double> valores;
  final List<String> etiquetas;
  final bool esPesos;
  final String? diaSeleccionada;
  final List<PuntoSerie> series;
  final ValueChanged<String> onBarTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
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
              FlLine(color: tokens.line, strokeWidth: 0.5),
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
                style: TextStyle(fontSize: 10, color: tokens.muted),
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
                    style: TextStyle(fontSize: 9, color: tokens.muted),
                  ),
                );
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => tokens.leaf2,
            getTooltipItem: (group, _, rod, _) {
              final v = rod.toY;
              return BarTooltipItem(
                esPesos ? moneda(v) : '${v.toStringAsFixed(0)} tickets',
                TextStyle(color: tokens.leafFg, fontSize: 11),
              );
            },
          ),
          touchCallback: (event, response) {
            if (response == null || response.spot == null) return;
            final idx = response.spot!.touchedBarGroupIndex;
            if (idx >= 0 && idx < series.length) {
              onBarTap(series[idx].dia);
            }
          },
        ),
        barGroups: [
          for (var i = 0; i < valores.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: valores[i],
                  width: 12,
                  color: series.isNotEmpty &&
                          diaSeleccionada == series[i].dia
                      ? tokens.terra
                      : tokens.leaf,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(4)),
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
  const _LineChart({
    required this.valores,
    required this.esPesos,
    this.relleno = false,
  });

  final List<double> valores;
  final bool esPesos;
  final bool relleno;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
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
              FlLine(color: tokens.line, strokeWidth: 0.5),
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
                style: TextStyle(fontSize: 10, color: tokens.muted),
              ),
            ),
          ),
          bottomTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => tokens.leaf2,
            getTooltipItems: (touched) => touched.map((spot) {
              final v = spot.y;
              return LineTooltipItem(
                esPesos ? moneda(v) : '${v.toStringAsFixed(0)} tickets',
                TextStyle(color: tokens.leafFg, fontSize: 11),
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
            color: tokens.leaf,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: relleno,
              color: tokens.leaf.withValues(alpha: 0.16),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tarjeta plana con borde `line` y radio 10, como las secciones de la web.
class _Tarjeta extends StatelessWidget {
  const _Tarjeta({required this.child, this.clave, this.padding});

  final Widget child;
  final Key? clave;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      key: clave,
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: padding ?? const EdgeInsets.fromLTRB(12, 12, 12, 14),
      child: child,
    );
  }
}

/// Medios de pago en el riel inferior (gap 2: reemplaza el _FormasCard
/// separado). Pie chart interactivo + lista con tap para filtrar.
class _MediosRailCard extends StatelessWidget {
  const _MediosRailCard({
    required this.formas,
    required this.activo,
    required this.onPick,
  });

  final List<FormaPagoTotal> formas;
  final String? activo;
  final ValueChanged<String> onPick;

  static const _paleta = <Color>[
    Color(0xFF263449),
    Color(0xFF1D5FD4),
    Color(0xFF9A4708),
    Color(0xFF7D5800),
  ];

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return _TarjetaRail(
      clave: const Key('dashboard_medios_card'),
      titulo: 'Medios',
      child: formas.isEmpty
          ? Text('Sin cobros en el período.',
              style: TextStyle(fontSize: 12, color: tokens.muted))
          : Column(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 70,
                    child: PieChart(
                      PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 16,
                        sections: [
                          for (var i = 0; i < formas.length; i++)
                            PieChartSectionData(
                              value: formas[i].total,
                              color: _paleta[i % _paleta.length],
                              radius: 28,
                              title: '',
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                for (var i = 0; i < formas.length && i < 3; i++)
                  GestureDetector(
                    onTap: () => onPick(formas[i].formaPago),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: activo == formas[i].formaPago
                            ? tokens.okBg
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: _paleta[i % _paleta.length],
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              _formaLabel(formas[i].formaPago),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 10, color: tokens.ink),
                            ),
                          ),
                          Text(
                            moneda(formas[i].total),
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: tokens.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }

  static String _formaLabel(String key) => switch (key) {
        'efectivo' => 'Efectivo',
        'transferencia' => 'Transfer.',
        'tarjeta' => 'Tarjeta',
        'cuenta_corriente' => 'Cta. cte.',
        _ => key,
      };
}

class _RailCola extends StatelessWidget {
  const _RailCola({
    required this.cola,
    required this.enCola,
    required this.verCola,
    required this.onVerCola,
  });

  final List<PedidoCola> cola;
  final int enCola;
  final bool verCola;
  final VoidCallback onVerCola;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return _TarjetaRail(
      clave: const Key('dashboard_cola_card'),
      titulo: 'Cola · $enCola',
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              GestureDetector(
                onTap: onVerCola,
                child: Text(
                  verCola ? 'Cobros' : 'Ver',
                  style: TextStyle(fontSize: 11, color: tokens.leaf),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Expanded(
            child: cola.isEmpty
                ? Text('Nadie esperando.',
                    style: TextStyle(fontSize: 12, color: tokens.muted))
                : ListView.separated(
                    padding: EdgeInsets.zero,
                    itemCount: cola.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (context, i) {
                      final p = cola[i];
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              p.cliente,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 13, color: tokens.ink),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            moneda(p.total),
                            style: TextStyle(
                                fontSize: 12, color: tokens.muted),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _RailProductos extends StatelessWidget {
  const _RailProductos({
    required this.top,
    this.activo,
    this.onPick,
  });

  final List<ProductoTop> top;
  final String? activo;
  final ValueChanged<String>? onPick;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final maximo = top.fold<double>(0, (a, t) => t.total > a ? t.total : a);
    return _TarjetaRail(
      clave: const Key('dashboard_top_card'),
      titulo: 'Productos',
      child: top.isEmpty
          ? Text('Todavía no hay ventas.',
              style: TextStyle(fontSize: 12, color: tokens.muted))
          : ListView.separated(
              padding: EdgeInsets.zero,
              itemCount: top.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final t = top[i];
                final fraccion =
                    maximo == 0 ? 0.0 : (t.total / maximo).clamp(0.06, 1.0);
                final on = activo == t.nombre;
                return GestureDetector(
                  onTap: onPick != null ? () => onPick!(t.nombre) : null,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              t.nombre,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: tokens.ink),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            moneda(t.total),
                            style:
                                TextStyle(fontSize: 12, color: tokens.muted),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: fraccion,
                          minHeight: 6,
                          backgroundColor: tokens.paper2,
                          valueColor: AlwaysStoppedAnimation(
                              on ? tokens.terra : tokens.leaf),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

/// Tarjeta del riel inferior: altura fija 160 px (`h-40` de la web), título
/// uppercase y contenido desplazable.
class _TarjetaRail extends StatelessWidget {
  const _TarjetaRail({
    required this.titulo,
    required this.child,
    this.clave,
  });

  final String titulo;
  final Widget child;
  final Key? clave;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      key: clave,
      height: 160,
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            titulo.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: 1.2,
              color: tokens.muted,
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _MovimientosCard extends StatefulWidget {
  const _MovimientosCard({
    required this.movimientos,
    required this.cola,
    required this.verCola,
    this.dia,
    this.pago,
    this.producto,
  });

  final List<Movimiento> movimientos;
  final List<PedidoCola> cola;
  final bool verCola;
  final String? dia;
  final String? pago;
  final String? producto;

  @override
  State<_MovimientosCard> createState() => _MovimientosCardState();
}

class _MovimientosCardState extends State<_MovimientosCard> {
  String _filtro = '';

  List<Movimiento> get _filtrados {
    var rows = widget.movimientos;
    // Filtro por día (gap 5: drill-down desde gráfico).
    if (widget.dia != null) {
      rows = rows
          .where((m) => m.createdAt.replaceFirst('T', ' ').startsWith(widget.dia!))
          .toList();
    }
    // Filtro por forma de pago.
    if (widget.pago != null) {
      rows = rows.where((m) => m.formaPago == widget.pago).toList();
    }
    // Filtro por producto.
    if (widget.producto != null) {
      rows = rows
          .where((m) =>
              m.productos.toLowerCase().contains(widget.producto!.toLowerCase()))
          .toList();
    }
    // Filtro de texto libre.
    if (_filtro.isNotEmpty) {
      final q = _filtro.toLowerCase();
      rows = rows
          .where((m) =>
              m.cliente.toLowerCase().contains(q) ||
              m.productos.toLowerCase().contains(q) ||
              m.formaPago.toLowerCase().contains(q) ||
              (m.numero?.toString().contains(q) ?? false))
          .toList();
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final visibles = _filtrados.take(12).toList();
    return _Tarjeta(
      clave: const Key('dashboard_movimientos_card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.verCola ? 'Cola ahora' : 'Movimientos',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: tokens.ink,
            ),
          ),
          if (!widget.verCola) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 34,
              child: TextField(
                key: const Key('dashboard_movimientos_filtro'),
                decoration: const InputDecoration(
                  hintText: 'Cliente o ticket',
                  prefixIcon: Icon(Icons.search, size: 16),
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(vertical: 6),
                ),
                style: const TextStyle(fontSize: 12),
                onChanged: (v) => setState(() => _filtro = v),
              ),
            ),
          ],
          const SizedBox(height: 8),
          if (widget.verCola)
            if (widget.cola.isEmpty)
              Text('No hay pedidos esperando.',
                  style: TextStyle(fontSize: 12, color: tokens.muted))
            else
              for (final p in widget.cola.take(12))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: _FilaMovimiento(
                    tokens: tokens,
                    titulo: p.cliente,
                    subtitulo:
                        '${_estadoLabel(p.estado)} · ${_horaCorta(p.createdAt)}',
                    monto: moneda(p.total),
                  ),
                )
          else if (visibles.isEmpty && _filtro.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                'Sin resultados para "$_filtro".',
                style: TextStyle(fontSize: 12, color: tokens.muted),
                textAlign: TextAlign.center,
              ),
            )
          else if (visibles.isEmpty)
            Text('Nada para este filtro.',
                style: TextStyle(fontSize: 12, color: tokens.muted))
          else
            for (final m in visibles)
              InkWell(
                key: ValueKey('mov_${m.id}'),
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (_) => TicketDialog(cobroId: m.id),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: _FilaMovimiento(
                    tokens: tokens,
                    titulo: m.cliente,
                    subtitulo:
                        '${m.numero != null ? 'Nº ${m.numero} · ' : ''}${_formaLabel(m.formaPago)} · ${_horaCorta(m.createdAt)}',
                    monto: moneda(m.monto),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  static String _formaLabel(String key) => switch (key) {
        'efectivo' => 'Efectivo',
        'transferencia' => 'Transferencia',
        'tarjeta' => 'Tarjeta',
        'cuenta_corriente' => 'Cta. cte.',
        _ => key,
      };

  static String _estadoLabel(String estado) => switch (estado) {
        'enviado' => 'Enviado',
        'en_preparacion' => 'En preparación',
        'listo' => 'Listo',
        _ => estado,
      };

  static String _horaCorta(String createdAt) {
    final partes = createdAt.split(' ');
    if (partes.length < 2) return createdAt;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}

class _FilaMovimiento extends StatelessWidget {
  const _FilaMovimiento({
    required this.tokens,
    required this.titulo,
    required this.subtitulo,
    required this.monto,
  });

  final TokensMostrador tokens;
  final String titulo;
  final String subtitulo;
  final String monto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: tokens.ink,
                  ),
                ),
                Text(
                  subtitulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: tokens.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            monto,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: tokens.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _TurnoCard extends ConsumerWidget {
  const _TurnoCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final caja = ref.watch(cajaEstadoProvider);
    return caja.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (estado) {
        final tokens = context.tokens;
        final totalCobrado =
            estado.totales.fold<double>(0, (a, t) => a + t.total);
        final nCobros = estado.totales.fold<int>(0, (a, t) => a + t.n);
        return _Tarjeta(
          clave: const Key('dashboard_turno_card'),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(Icons.point_of_sale, size: 18, color: tokens.leaf),
              const SizedBox(width: 8),
              Text(
                'Turno',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: tokens.ink,
                ),
              ),
              const SizedBox(width: 16),
              _TurnoChip(
                label: 'Cobrado',
                valor: moneda(totalCobrado),
                color: tokens.leaf,
              ),
              const SizedBox(width: 12),
              _TurnoChip(
                label: 'Cobros',
                valor: '$nCobros',
                color: tokens.terra,
              ),
              if (estado.egresos > 0) ...[
                const SizedBox(width: 12),
                _TurnoChip(
                  label: 'Egresos',
                  valor: moneda(estado.egresos),
                  color: tokens.alerta,
                ),
              ],
              const SizedBox(width: 12),
              _TurnoChip(
                label: 'Esperado',
                valor: moneda(estado.esperado),
                color: tokens.naranja,
              ),
              const Spacer(),
              Text(
                'Desde ${_horaDesde(estado.abiertoAt)}',
                style: TextStyle(fontSize: 12, color: tokens.muted),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _horaDesde(String abiertoAt) {
    final partes = abiertoAt.split(' ');
    if (partes.length < 2) return abiertoAt;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}

class _TurnoChip extends StatelessWidget {
  const _TurnoChip({
    required this.label,
    required this.valor,
    required this.color,
  });

  final String label;
  final String valor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          valor,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 10, color: context.tokens.muted),
        ),
      ],
    );
  }
}

class _StockBoardCard extends ConsumerWidget {
  const _StockBoardCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogo = ref.watch(catalogoProvider);
    return catalogo.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (cat) {
        final activos =
            cat.productos.where((p) => p.activo).toList(growable: false);
        if (activos.isEmpty) return const SizedBox.shrink();
        final sinStock = activos.where((p) => p.stock <= 0).length;
        final tokens = context.tokens;
        return _Tarjeta(
          clave: const Key('dashboard_stock_board'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: 'Stock ',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: tokens.ink,
                      ),
                    ),
                    TextSpan(
                      text: '${activos.length} productos',
                      style: TextStyle(fontSize: 12, color: tokens.muted),
                    ),
                    if (sinStock > 0)
                      TextSpan(
                        text: ' · $sinStock sin stock',
                        style: TextStyle(fontSize: 12, color: tokens.alerta),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [for (final p in activos) _StockCell(producto: p)],
              ),
            ],
          ),
        );
      },
    );
  }
}

enum _StockNivel { ok, mid, low, out }

class _StockCell extends StatelessWidget {
  const _StockCell({required this.producto});

  final Producto producto;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final capacidad =
        (producto.stockMinimo > 0 ? producto.stockMinimo : 1) * 4;
    final fraccion = (producto.stock / capacidad).clamp(0.0, 1.0);
    final nivel = producto.stock <= 0
        ? _StockNivel.out
        : fraccion < 0.25
            ? _StockNivel.low
            : fraccion < 0.5
                ? _StockNivel.mid
                : _StockNivel.ok;
    final color = switch (nivel) {
      _StockNivel.ok => tokens.ok,
      _StockNivel.mid => tokens.naranja,
      _StockNivel.low => tokens.ambar,
      _StockNivel.out => tokens.alerta,
    };
    return SizedBox(
      width: 104,
      height: 56,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: tokens.line),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                producto.nombre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: tokens.ink),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(
                        value: fraccion,
                        minHeight: 6,
                        backgroundColor: tokens.paper2,
                        valueColor: AlwaysStoppedAnimation(color),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${producto.stock.toStringAsFixed(producto.stock == producto.stock.roundToDouble() ? 0 : 1)}'
                    ' ${producto.unidadLabel}',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 1: Vitrina (slider productos destacados + trial)
// ---------------------------------------------------------------------------

/// Tintes para las láminas de la vitrina, equivalentes a los de la web.
const _vitrinaTintes = <({Color fondo, Color tinta})>[
  (fondo: Color(0xFFf6e3cf), tinta: Color(0xFF6a2e12)),
  (fondo: Color(0xFFe7f2e4), tinta: Color(0xFF145c38)),
  (fondo: Color(0xFFf8efd0), tinta: Color(0xFF6d5310)),
  (fondo: Color(0xFFf4e4d6), tinta: Color(0xFF7a3418)),
];

class _VitrinaCard extends StatefulWidget {
  const _VitrinaCard({
    required this.trial,
    required this.productos,
    required this.onProducto,
  });

  final TrialInfo? trial;
  final List<ProductoTop> productos;
  final ValueChanged<String> onProducto;

  @override
  State<_VitrinaCard> createState() => _VitrinaCardState();
}

class _VitrinaCardState extends State<_VitrinaCard> {
  final _controller = PageController(viewportFraction: 0.92);
  Timer? _autoTimer;
  int _pagina = 0;

  List<_VitrinaLamina> get _laminas {
    final laminas = <_VitrinaLamina>[];
    for (var i = 0; i < widget.productos.length; i++) {
      final p = widget.productos[i];
      final tono = _vitrinaTintes[i % _vitrinaTintes.length];
      laminas.add(_VitrinaLamina(
        id: 'prod-${p.nombre}',
        kicker: i == 0 ? 'Destacado' : 'También salió',
        titulo: p.nombre,
        texto: '${moneda(p.total)} en este período. Tocá para ver esos movimientos.',
        fondo: tono.fondo,
        tinta: tono.tinta,
        icono: Icons.storefront_outlined,
        producto: p.nombre,
      ));
    }
    final trial = widget.trial;
    if (trial != null) {
      final puestoTexto = trial.puesto == null
          ? 'Hoy todavía no cobraste.'
          : trial.puesto == 1
              ? 'Hoy vas primero, con ${trial.liderTickets} tickets.'
              : 'Estás ${trial.puesto}° del día. El líder lleva ${trial.liderTickets} tickets.';
      laminas.add(_VitrinaLamina(
        id: 'trial-hoy',
        kicker: 'Hoy',
        titulo: '${trial.ticketsHoy} tickets',
        texto: 'Llevás ${trial.ticketsTrial} en el trial.',
        fondo: _vitrinaTintes[1].fondo,
        tinta: _vitrinaTintes[1].tinta,
        icono: Icons.emoji_events_outlined,
      ));
      laminas.add(_VitrinaLamina(
        id: 'trial-puesto',
        kicker: 'El mercado',
        titulo: puestoTexto,
        texto: '${trial.compradores} compradores con pedido. ${trial.puestos} puestos cobraron.',
        fondo: _vitrinaTintes[2].fondo,
        tinta: _vitrinaTintes[2].tinta,
        icono: Icons.leaderboard_outlined,
      ));
      laminas.add(_VitrinaLamina(
        id: 'trial-dias',
        kicker: 'Trial Pro',
        titulo: trial.diasRestantes == 1
            ? 'Queda 1 día'
            : 'Quedan ${trial.diasRestantes} días',
        texto: 'Cuando termina, Pro se contrata desde Add-ons.',
        fondo: _vitrinaTintes[0].fondo,
        tinta: _vitrinaTintes[0].tinta,
        icono: Icons.star_outline,
      ));
    }
    if (laminas.isEmpty) {
      laminas.add(_VitrinaLamina(
        id: 'sin-ventas',
        kicker: 'Tu puesto',
        titulo: 'Todavía no hay ventas',
        texto: 'Cuando cobres, acá vas a ver los productos que más salieron.',
        fondo: _vitrinaTintes[3].fondo,
        tinta: _vitrinaTintes[3].tinta,
        icono: Icons.point_of_sale_outlined,
      ));
    }
    return laminas;
  }

  @override
  void initState() {
    super.initState();
    _iniciarAutoSlide();
  }

  void _iniciarAutoSlide() {
    _autoTimer?.cancel();
    _autoTimer = Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted || _laminas.length < 2) return;
      final next = (_pagina + 1) % _laminas.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final laminas = _laminas;
    return SizedBox(
      height: 148,
      child: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: laminas.length,
            onPageChanged: (i) => setState(() => _pagina = i),
            itemBuilder: (context, i) {
              final lam = laminas[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _VitrinaLaminaWidget(
                  lamina: lam,
                  onTap: lam.producto != null
                      ? () => widget.onProducto(lam.producto!)
                      : null,
                ),
              );
            },
          ),
          if (laminas.length > 1)
            Positioned(
              right: 12,
              bottom: 8,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var i = 0; i < laminas.length; i++)
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      width: _pagina == i ? 16 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: _pagina == i
                            ? const Color(0xFFf6e7c4)
                            : Colors.white.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _VitrinaLamina {
  const _VitrinaLamina({
    required this.id,
    required this.kicker,
    required this.titulo,
    required this.texto,
    required this.fondo,
    required this.tinta,
    required this.icono,
    this.producto,
  });

  final String id;
  final String kicker;
  final String titulo;
  final String texto;
  final Color fondo;
  final Color tinta;
  final IconData icono;
  final String? producto;
}

class _VitrinaLaminaWidget extends StatelessWidget {
  const _VitrinaLaminaWidget({required this.lamina, this.onTap});

  final _VitrinaLamina lamina;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: lamina.fondo,
          borderRadius: BorderRadius.circular(14),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Gradiente diagonal simulado.
            Positioned(
              right: -30,
              top: -30,
              child: Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: lamina.tinta.withValues(alpha: 0.08),
                ),
              ),
            ),
            Positioned(
              left: 0,
              bottom: 0,
              right: 0,
              child: Container(
                height: 90,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      lamina.tinta.withValues(alpha: 0.72),
                      lamina.tinta.withValues(alpha: 0.35),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              right: 14,
              top: 14,
              child: Icon(lamina.icono, size: 36, color: lamina.tinta.withValues(alpha: 0.25)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    lamina.kicker.toUpperCase(),
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 1.6,
                      color: lamina.tinta.withValues(alpha: 0.8),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    lamina.titulo,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Fraunces',
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: lamina.tinta,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    lamina.texto,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: lamina.tinta.withValues(alpha: 0.8),
                    ),
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

// ---------------------------------------------------------------------------
// Gap 2: Alertas integradas en el riel inferior
// ---------------------------------------------------------------------------

class _AlertasCard extends ConsumerWidget {
  const _AlertasCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final alertas = ref.watch(alertasProvider);
    return _TarjetaRail(
      clave: const Key('dashboard_alertas_card'),
      titulo: 'Alertas',
      child: alertas.when(
        loading: () => const Center(
          child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (_, _) => Text('No se pudieron cargar.',
            style: TextStyle(fontSize: 11, color: tokens.muted)),
        data: (lista) {
          if (lista.isEmpty) {
            return Text('Nada pendiente.',
                style: TextStyle(fontSize: 12, color: tokens.muted));
          }
          return ListView.separated(
            padding: EdgeInsets.zero,
            itemCount: lista.length > 5 ? 5 : lista.length,
            separatorBuilder: (_, _) => const SizedBox(height: 6),
            itemBuilder: (context, i) {
              final a = lista[i];
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      a.mensaje,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: a.leida ? tokens.muted : tokens.ink,
                      ),
                    ),
                  ),
                  if (!a.leida) ...[
                    const SizedBox(width: 4),
                    GestureDetector(
                      onTap: () async {
                        try {
                          await ref.read(alertasServiceProvider).marcarLeida(a.id);
                          ref.invalidate(alertasProvider);
                        } catch (_) {}
                      },
                      child: Text(
                        'Leída',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: tokens.leaf,
                        ),
                      ),
                    ),
                  ],
                ],
              );
            },
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 3: Ranking de cargadores en el riel inferior
// ---------------------------------------------------------------------------

class _RankingCargadoresCard extends ConsumerWidget {
  const _RankingCargadoresCard();

  static String _etiquetaNivel(String codigo) => switch (codigo) {
        'nuevo' => 'Nuevo',
        'bronce' => 'Bronce',
        'plata' => 'Plata',
        'oro' => 'Oro',
        'elite' => 'Elite',
        _ => codigo,
      };

  static Color _colorNivel(String codigo, TokensMostrador tokens) => switch (codigo) {
        'elite' => tokens.leaf,
        'oro' => tokens.ambar,
        'plata' => tokens.muted,
        'bronce' => tokens.naranja,
        _ => tokens.inkSoft,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final ranking = ref.watch(rankingCargadoresProvider);
    return _TarjetaRail(
      clave: const Key('dashboard_cargadores_card'),
      titulo: 'Cargadores',
      child: ranking.when(
        loading: () => const Center(
          child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (_, _) => Text('No se pudo cargar.',
            style: TextStyle(fontSize: 11, color: tokens.muted)),
        data: (data) {
          if (data.ranking.isEmpty) {
            return Text('Todavía no hay cargadores.',
                style: TextStyle(fontSize: 12, color: tokens.muted));
          }
          return ListView.separated(
            padding: EdgeInsets.zero,
            itemCount: data.ranking.length > 8 ? 8 : data.ranking.length,
            separatorBuilder: (_, _) => const SizedBox(height: 4),
            itemBuilder: (context, i) {
              final item = data.ranking[i];
              return Row(
                children: [
                  SizedBox(
                    width: 18,
                    child: Text(
                      '${item.puesto}',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: tokens.muted,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      item.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: tokens.ink),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: _colorNivel(item.nivel, tokens).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      _etiquetaNivel(item.nivel),
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: _colorNivel(item.nivel, tokens),
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 4: Sucursales mini-widget
// ---------------------------------------------------------------------------

class _SucursalesCard extends ConsumerWidget {
  const _SucursalesCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final sucursalesAsync = ref.watch(sucursalesProvider);
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        border: Border.all(color: tokens.line),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: sucursalesAsync.when(
        loading: () => Row(
          children: [
            Icon(Icons.store_outlined, size: 18, color: tokens.leaf),
            const SizedBox(width: 10),
            Text('Cargando sucursales…',
                style: TextStyle(fontSize: 12, color: tokens.muted)),
          ],
        ),
        error: (_, _) => Row(
          children: [
            Icon(Icons.store_outlined, size: 18, color: tokens.leaf),
            const SizedBox(width: 10),
            Expanded(
              child: Text('Sucursales',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: tokens.ink)),
            ),
          ],
        ),
        data: (data) {
          return Row(
            children: [
              Icon(Icons.store_outlined, size: 18, color: tokens.leaf),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sucursales',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: tokens.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${data.sucursales.length} activa${data.sucursales.length == 1 ? '' : 's'} · ${data.cruce.length} en comparación',
                      style: TextStyle(fontSize: 11, color: tokens.muted),
                    ),
                  ],
                ),
              ),
              if (data.cruce.isNotEmpty)
                ...data.cruce.take(2).map((c) => Padding(
                      padding: const EdgeInsets.only(left: 10),
                      child: Column(
                        children: [
                          Text(
                            moneda(c.ventas),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: tokens.ink,
                            ),
                          ),
                          Text(
                            c.nombre,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 10, color: tokens.muted),
                          ),
                        ],
                      ),
                    )),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Gap 5: Chips de filtros combinados
// ---------------------------------------------------------------------------

class _FiltroChips extends StatelessWidget {
  const _FiltroChips({
    required this.dias,
    this.dia,
    this.pago,
    this.producto,
    required this.onClearDia,
    required this.onClearPago,
    required this.onClearProducto,
  });

  final int dias;
  final String? dia;
  final String? pago;
  final String? producto;
  final VoidCallback onClearDia;
  final VoidCallback onClearPago;
  final VoidCallback onClearProducto;

  static String _diaCorto(String iso) {
    if (iso.length > 10) {
      final hora = iso.length > 11 ? iso.substring(11, 13) : '';
      return '${hora}h';
    }
    final parts = iso.split('-');
    if (parts.length == 3) return '${parts[2]}/${parts[1]}';
    return iso;
  }

  static String _pagoLabel(String key) => switch (key) {
        'efectivo' => 'Efectivo',
        'transferencia' => 'Transferencia',
        'tarjeta' => 'Tarjeta',
        'cuenta_corriente' => 'Cuenta corriente',
        _ => key,
      };

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        if (dia != null)
          _ChipRemovable(
            label: dias == 1 ? 'Hora ${_diaCorto(dia!)}' : 'Día ${_diaCorto(dia!)}',
            onClear: onClearDia,
            color: tokens.leaf,
          ),
        if (pago != null)
          _ChipRemovable(
            label: _pagoLabel(pago!),
            onClear: onClearPago,
            color: tokens.leaf,
          ),
        if (producto != null)
          _ChipRemovable(
            label: producto!,
            onClear: onClearProducto,
            color: tokens.leaf,
          ),
      ],
    );
  }
}

class _ChipRemovable extends StatelessWidget {
  const _ChipRemovable({
    required this.label,
    required this.onClear,
    required this.color,
  });

  final String label;
  final VoidCallback onClear;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tokens.okBg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onClear,
            child: Text(
              '×',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _Decoro {
  const _Decoro({
    required this.venta,
    this.compra,
    required this.temp,
    required this.cielo,
  });
  final int venta;
  final int? compra;
  final int temp;
  final String cielo;
}

class _ClimaDolar extends StatefulWidget {
  const _ClimaDolar();

  @override
  State<_ClimaDolar> createState() => _ClimaDolarState();
}

class _ClimaDolarState extends State<_ClimaDolar> {
  static const _lat = -34.7;
  static const _lon = -58.5;
  _Decoro? _dato;
  bool _cargando = true;
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    _cargar();
    _refresh = Timer.periodic(const Duration(minutes: 30), (_) => _cargar());
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final respuestas = await Future.wait([
        http.get(Uri.parse('https://dolarapi.com/v1/dolares/oficial')),
        http.get(Uri.parse(
          'https://api.open-meteo.com/v1/forecast'
          '?latitude=$_lat&longitude=$_lon'
          '&current=temperature_2m,weather_code'
          '&timezone=America/Argentina/Buenos_Aires',
        )),
      ]);
      if (!mounted) return;
      if (respuestas[0].statusCode != 200 || respuestas[1].statusCode != 200) {
        setState(() => _cargando = false);
        return;
      }
      final dolar = jsonDecode(respuestas[0].body) as Map<String, dynamic>;
      final clima = jsonDecode(respuestas[1].body) as Map<String, dynamic>;
      final current = clima['current'] as Map<String, dynamic>?;
      final ventaRaw = dolar['venta'];
      final tempRaw = current?['temperature_2m'];
      if (ventaRaw is! num || tempRaw is! num) {
        setState(() => _cargando = false);
        return;
      }
      final compraRaw = dolar['compra'];
      setState(() {
        _dato = _Decoro(
          venta: ventaRaw.round(),
          compra: compraRaw is num ? compraRaw.round() : null,
          temp: tempRaw.round(),
          cielo: _textoClima((current?['weather_code'] as num?)?.toInt() ?? -1),
        );
        _cargando = false;
      });
    } catch (_) {
      if (mounted) setState(() => _cargando = false);
    }
  }

  static String _textoClima(int code) {
    if (code == 0) return 'despejado';
    if (code <= 3) return 'nublado';
    if (code == 45 || code == 48) return 'niebla';
    if (code <= 67) return 'lluvia';
    if (code <= 77) return 'nieve';
    if (code <= 82) return 'chaparrón';
    if (code >= 95) return 'tormenta';
    return 'variable';
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const SizedBox.shrink();
    final d = _dato;
    if (d == null) return const SizedBox.shrink();
    final tokens = context.tokens;
    final style = TextStyle(fontSize: 12, color: tokens.inkSoft);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            border: Border.all(color: tokens.line),
            borderRadius: BorderRadius.circular(12),
            color: tokens.surface,
          ),
          child: Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Oficial '),
                TextSpan(
                  text: '\$${d.venta}',
                  style: style.copyWith(fontWeight: FontWeight.w600),
                ),
                if (d.compra != null)
                  TextSpan(
                    text: ' · compra \$${d.compra}',
                    style: style.copyWith(color: tokens.muted),
                  ),
              ],
            ),
            style: style,
          ),
        ),
        const SizedBox(width: 8),
        Text('${d.temp}° ${d.cielo}', style: style),
      ],
    );
  }
}
