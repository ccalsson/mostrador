import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/dashboard.dart';
import '../../services/dashboard_service.dart';

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
              const Text(
                'Dashboard',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
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

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.data, required this.dias});

  final DashboardResumen data;
  final int dias;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return ListView(
      key: const Key('dashboard_lista'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      children: [
        // ── Tarjetas principales ─────────────────────────────────────────────
        _TarjetasRow(
          tarjetas: [
            _TarjetaDato(
              clave: 'dashboard_total_ventas',
              icono: Icons.trending_up,
              titulo: 'Ventas',
              valor: moneda(data.totalVentas),
              color: colorScheme.primary,
            ),
            _TarjetaDato(
              clave: 'dashboard_total_cobrado',
              icono: Icons.payments_outlined,
              titulo: 'Cobrado',
              valor: moneda(data.totalCobrado),
              color: Colors.green,
            ),
          ],
        ),
        const SizedBox(height: 12),
        _TarjetasRow(
          tarjetas: [
            _TarjetaDato(
              clave: 'dashboard_pedidos',
              icono: Icons.receipt_long_outlined,
              titulo: 'Pedidos',
              valor: '${data.cantidadPedidos}',
              color: Colors.blue,
            ),
            _TarjetaDato(
              clave: 'dashboard_pendientes',
              icono: Icons.hourglass_top_outlined,
              titulo: 'Pendientes',
              valor: '${data.pedidosPendientes}',
              color: data.pedidosPendientes > 0
                  ? Colors.orange
                  : colorScheme.onSurfaceVariant,
            ),
          ],
        ),
        const SizedBox(height: 12),
        _TarjetasRow(
          tarjetas: [
            _TarjetaDato(
              clave: 'dashboard_stock_bajo',
              icono: Icons.warning_amber_outlined,
              titulo: 'Stock bajo',
              valor: '${data.stockBajoCount}',
              color:
                  data.stockBajoCount > 0 ? Colors.red : colorScheme.onSurfaceVariant,
            ),
            _TarjetaDato(
              clave: 'dashboard_alertas',
              icono: Icons.notifications_outlined,
              titulo: 'Alertas',
              valor: '${data.alertasSinLeer}',
              color: data.alertasSinLeer > 0
                  ? Colors.orange
                  : colorScheme.onSurfaceVariant,
            ),
          ],
        ),

        // ── Por forma de pago ────────────────────────────────────────────────
        if (data.porFormaPago.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            'Por forma de pago',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          ...data.porFormaPago.entries.map(
            (entry) => _FormaPagoRow(
              forma: _formaLabel(entry.key),
              monto: entry.value,
            ),
          ),
        ],

        // ── Período ─────────────────────────────────────────────────────────
        const SizedBox(height: 24),
        Text(
          dias == 1
              ? 'Datos de hoy'
              : 'Datos de los últimos $dias días',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
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

class _FormaPagoRow extends StatelessWidget {
  const _FormaPagoRow({required this.forma, required this.monto});

  final String forma;
  final double monto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(forma),
          ),
          Text(
            moneda(monto),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
