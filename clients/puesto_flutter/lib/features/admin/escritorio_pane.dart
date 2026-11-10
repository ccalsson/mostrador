import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/refresco.dart';
import '../../models/escritorio.dart';
import '../../services/catalogo_service.dart';
import '../../services/escritorio_service.dart';
import 'mensajes_tab.dart';

/// Formatea un monto en pesos argentinos sin depender de locale intl.
String _ars(double value) {
  final n = value.round();
  final neg = n < 0;
  final abs = n.abs().toString();
  final buf = StringBuffer(neg ? '-\$' : '\$');
  for (var i = 0; i < abs.length; i++) {
    final pos = abs.length - i;
    if (i > 0 && pos % 3 == 0) buf.write('.');
    buf.write(abs[i]);
  }
  return buf.toString();
}

/// Formatea una fecha ISO como "lun 18 oct, 14:00" sin depender de locale intl.
String _fechaCorta(String iso) {
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dias = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  final dow = dias[dt.weekday - 1];
  final mes = meses[dt.month - 1];
  final hh = dt.hour.toString().padLeft(2, '0');
  final mm = dt.minute.toString().padLeft(2, '0');
  return '$dow ${dt.day} $mes, $hh:$mm';
}

/// Pantalla Escritorio del dueño — 5 tabs: Comprador, Margen, Deudas, Cierres,
/// Lista publicada.
///
/// Paridad con la web (escritorio.tsx). Solo admin.
///
/// Los números del escritorio y la lista publicada se releen solos. Pasar
/// `intervalo: null` congela el sondeo (widget tests).
class EscritorioPane extends ConsumerStatefulWidget {
  const EscritorioPane({super.key, this.intervalo = kSondeoMuyLento});

  final Duration? intervalo;

  @override
  ConsumerState<EscritorioPane> createState() => _EscritorioPaneState();
}

class _EscritorioPaneState extends ConsumerState<EscritorioPane>
    with SingleTickerProviderStateMixin, RefrescoAutomatico<EscritorioPane> {
  late final TabController _tabController =
      TabController(length: 5, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Duration? get intervalo => widget.intervalo;

  @override
  Future<void> refrescar() => _recargar();

  Future<void> _recargar() async {
    ref.invalidate(escritorioProvider);
    ref.invalidate(catalogoProvider);
    try {
      await ref.read(escritorioProvider.future);
    } on ApiException {
      // El rebuild de `resumenAsync` ya muestra el estado de error.
    }
  }

  @override
  Widget build(BuildContext context) {
    final resumenAsync = ref.watch(escritorioProvider);
    return Column(
      children: [
        _TabBar(controller: _tabController),
        if (resumenAsync.isRefreshing)
          const LinearProgressIndicator(
            key: Key('escritorio_refrescando'),
            minHeight: 2,
          ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              // Tab 0: Comprador (mensajes) — no requiere premium
              const MensajesTab(),
              // Tabs 1-3: requieren premium
              resumenAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, stack) =>
                    _ErrorView(error: error, onRetry: _recargar),
                data: (data) {
                  if (!data.premium) return const _PremiumRequerido();
                  return _MargenTab(margen: data.margen, onRefresh: _recargar);
                },
              ),
              resumenAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, stack) =>
                    _ErrorView(error: error, onRetry: _recargar),
                data: (data) {
                  if (!data.premium) return const _PremiumRequerido();
                  return _DeudasTab(deudas: data.deudas);
                },
              ),
              resumenAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, stack) =>
                    _ErrorView(error: error, onRetry: _recargar),
                data: (data) {
                  if (!data.premium) return const _PremiumRequerido();
                  return _CierresTab(cierres: data.cierres);
                },
              ),
              // Tab 4: Lista publicada — no requiere premium
              const _ListaPublicaTab(),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

class _TabBar extends StatelessWidget {
  const _TabBar({required this.controller});
  final TabController controller;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      color: cs.surface,
      child: TabBar(
        controller: controller,
        labelColor: cs.onSurface,
        unselectedLabelColor: cs.onSurface.withValues(alpha: 0.5),
        indicatorColor: cs.primary,
        indicatorSize: TabBarIndicatorSize.label,
        tabs: const [
          Tab(text: 'Comprador'),
          Tab(text: 'Margen'),
          Tab(text: 'Deudas'),
          Tab(text: 'Cierres'),
          Tab(text: 'Lista publicada'),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Margen tab
// ---------------------------------------------------------------------------

class _MargenTab extends StatelessWidget {
  const _MargenTab({required this.margen, required this.onRefresh});
  final MargenDia margen;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // KPIs
          _KpiGrid(children: [
            _KpiCard(label: 'Cobrado, 7 días', value: _ars(margen.cobrado)),
            _KpiCard(label: 'Mercadería entrada', value: _ars(margen.costo)),
            _KpiCard(
              label: 'Diferencia',
              value: _ars(margen.diferencia),
              subtitle: 'Cobrado menos el precio de los remitos.',
            ),
            _KpiCard(
              label: 'Sin precio de compra',
              value: '${margen.sinPrecio}',
              subtitle: 'Esas líneas no entran al costo.',
            ),
          ]),
          const SizedBox(height: 20),

          // Serie diaria
          _SectionCard(
            title: 'Día por día',
            child: Column(
              children: margen.serie.map((row) {
                final dia = row.dia.length >= 10
                    ? '${row.dia.substring(8, 10)}/${row.dia.substring(5, 7)}'
                    : row.dia;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 50,
                        child: Text(dia,
                            style: TextStyle(
                                color: cs.onSurface.withValues(alpha: 0.5))),
                      ),
                      Expanded(child: Text(_ars(row.cobrado))),
                      Expanded(
                        child: Text(_ars(row.costo),
                            textAlign: TextAlign.right,
                            style: TextStyle(
                                color: cs.onSurface.withValues(alpha: 0.5))),
                      ),
                      SizedBox(
                        width: 100,
                        child: Text(_ars(row.diferencia),
                            textAlign: TextAlign.right),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 20),

          // Remitos confirmados
          _SectionCard(
            title: 'Remitos confirmados',
            child: Column(
              children: margen.entradas.isEmpty
                  ? [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text('Todavía no hay mercadería confirmada.',
                            style: TextStyle(
                                color: cs.onSurface.withValues(alpha: 0.5))),
                      ),
                    ]
                  : margen.entradas.map((e) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text.rich(TextSpan(children: [
                                TextSpan(text: e.proveedor),
                                TextSpan(
                                  text:
                                      ' · ${e.lineas} líneas · ${_fechaCorta(e.cuando)}',
                                  style: TextStyle(
                                      color:
                                          cs.onSurface.withValues(alpha: 0.5),
                                      fontSize: 12),
                                ),
                              ])),
                            ),
                            Text(_ars(e.costo)),
                          ],
                        ),
                      );
                    }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Deudas tab
// ---------------------------------------------------------------------------

class _DeudasTab extends StatelessWidget {
  const _DeudasTab({required this.deudas});
  final List<DeudaCliente> deudas;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final total = deudas.fold<double>(0, (acc, d) => acc + d.saldo);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionCard(
          title: 'Te deben',
          trailing: Text(
            _ars(total),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          child: Column(
            children: deudas.isEmpty
                ? [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Text('Nadie tiene saldo a favor del puesto.',
                          style: TextStyle(
                              color: cs.onSurface.withValues(alpha: 0.5))),
                    ),
                  ]
                : deudas.map((d) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(d.nombre,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w500)),
                          ),
                          Text(_ars(d.saldo)),
                          const SizedBox(width: 12),
                          TextButton(
                            onPressed: () {
                              // Navegar a ficha de cliente — placeholder
                            },
                            child: const Text('Ver cuenta'),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Cierres tab
// ---------------------------------------------------------------------------

class _CierresTab extends StatelessWidget {
  const _CierresTab({required this.cierres});
  final List<CierreCaja> cierres;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionCard(
          title: 'Cierres de caja',
          child: cierres.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text('Todavía no hay un turno cerrado.',
                      style: TextStyle(
                          color: cs.onSurface.withValues(alpha: 0.5))),
                )
              : SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Cierre')),
                      DataColumn(label: Text('Quién')),
                      DataColumn(label: Text('Esperado'), numeric: true),
                      DataColumn(label: Text('Contado'), numeric: true),
                      DataColumn(label: Text('Diferencia'), numeric: true),
                    ],
                    rows: cierres.map((c) {
                      final diffColor =
                          c.diferencia == 0 ? null : cs.error;
                      return DataRow(cells: [
                        DataCell(Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_fechaCorta(c.cerradoAt)),
                            if (c.notas.isNotEmpty)
                              Text(c.notas,
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: cs.onSurface
                                          .withValues(alpha: 0.5))),
                          ],
                        )),
                        DataCell(Text(c.quien)),
                        DataCell(Text(_ars(c.esperado),
                            textAlign: TextAlign.right)),
                        DataCell(Text(_ars(c.real),
                            textAlign: TextAlign.right)),
                        DataCell(Text(_ars(c.diferencia),
                            textAlign: TextAlign.right,
                            style: TextStyle(
                                color: diffColor,
                                fontWeight: diffColor != null
                                    ? FontWeight.w600
                                    : null))),
                      ]);
                    }).toList(),
                  ),
                ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Lista publicada tab
// ---------------------------------------------------------------------------

class _ListaPublicaTab extends ConsumerWidget {
  const _ListaPublicaTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogo = ref.watch(catalogoProvider);
    final cs = Theme.of(context).colorScheme;

    return catalogo.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error al cargar: $e')),
      data: (data) {
        final publicados =
            data.productos.where((p) => p.activo && p.publicadoOnline).toList();
        final ocultos =
            data.productos.where((p) => p.activo && !p.publicadoOnline).length;

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: cs.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: cs.outlineVariant),
              ),
              child: Text(
                publicados.isEmpty
                    ? 'No hay productos publicados en Mercado.'
                    : 'El comprador ve estos ${publicados.length} productos. '
                        '$ocultos activos siguen fuera de Mercado.',
                style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
              ),
            ),
            const SizedBox(height: 12),
            if (publicados.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    'Sin productos publicados.',
                    style: TextStyle(color: cs.onSurface.withValues(alpha: 0.5)),
                  ),
                ),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: publicados.map((p) {
                  return SizedBox(
                    width: _cardWidth(context),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: cs.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: cs.outlineVariant),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  p.nombre,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w500),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Text(moneda(p.precio)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'por ${p.unidad} · '
                            '${p.stock > 0 ? '${cantidadNum(p.stock)} en el puesto' : 'sin stock, el comprador igual puede pedirlo'}',
                            style: TextStyle(
                              fontSize: 12,
                              color: cs.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
          ],
        );
      },
    );
  }

  double _cardWidth(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w > 600) return (w - 48 - 8) / 2;
    return w - 32;
  }
}

// ---------------------------------------------------------------------------
// Shared widgets
// ---------------------------------------------------------------------------

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: children
          .map((c) => SizedBox(width: _kpiWidth(context), child: c))
          .toList(),
    );
  }

  double _kpiWidth(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w > 600) return (w - 48 - 24) / 2;
    return w - 32;
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    this.subtitle,
  });

  final String label;
  final String value;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: cs.onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: 4),
          Text(value,
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w600)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!,
                style: TextStyle(
                    fontSize: 11,
                    color: cs.onSurface.withValues(alpha: 0.5))),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w500)),
              const Spacer(),
              ?trailing,
            ],
          ),
          const Divider(height: 20),
          child,
        ],
      ),
    );
  }
}

class _PremiumRequerido extends StatelessWidget {
  const _PremiumRequerido();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: cs.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: cs.outlineVariant),
          ),
          child: Text(
            'Margen, deudas y cierres son del plan Premium. Los mensajes con el comprador y la lista publicada siguen en todos los planes.',
            style: TextStyle(color: cs.onSurface.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final msg = error.toString().contains('403')
        ? 'No tenés permisos para ver el escritorio.'
        : 'Error al cargar el escritorio.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: cs.error),
            const SizedBox(height: 12),
            Text(msg, style: TextStyle(color: cs.error)),
            const SizedBox(height: 16),
            FilledButton.tonal(
                onPressed: onRetry, child: const Text('Reintentar')),
          ],
        ),
      ),
    );
  }
}
