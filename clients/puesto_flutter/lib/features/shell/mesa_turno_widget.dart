import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../services/mesa_turno_service.dart';

/// Barra horizontal compacta con los 5 indicadores de la mesa del turno:
/// cobrado hoy, pedidos en curso, stock bajo, pedidos de la app y
/// publicados en Mercado.
///
/// Altura fija ~60px. Se muestra sólo para roles admin y cajero, arriba
/// del contenido principal y debajo del app bar.
class MesaTurnoWidget extends ConsumerWidget {
  const MesaTurnoWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mesaAsync = ref.watch(mesaTurnoProvider);
    final theme = Theme.of(context);

    return Container(
      height: 60,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        border: Border(
          bottom: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: mesaAsync.when(
        loading: () => const Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        error: (error, _) => Row(
          children: [
            Icon(Icons.error_outline,
                size: 18, color: theme.colorScheme.error),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'No se pudo cargar la mesa del turno.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.error),
              ),
            ),
            TextButton(
              onPressed: () => ref.invalidate(mesaTurnoProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
        data: (mesa) => Row(
          children: [
            _Indicador(
              clave: 'mesa_cobrado',
              icono: Icons.payments_outlined,
              valor: moneda(mesa.cobrado),
              etiqueta: 'Cobrado',
              color: theme.colorScheme.primary,
            ),
            const _Separador(),
            _Indicador(
              clave: 'mesa_en_curso',
              icono: Icons.hourglass_top_outlined,
              valor: '${mesa.enCurso}',
              etiqueta: 'En curso',
              color: mesa.enCurso > 0 ? Colors.orange : theme.colorScheme.onSurfaceVariant,
            ),
            const _Separador(),
            _Indicador(
              clave: 'mesa_stock_bajo',
              icono: Icons.inventory_2_outlined,
              valor: '${mesa.stockBajo}',
              etiqueta: 'Stock bajo',
              color: mesa.stockBajo > 0 ? Colors.red : theme.colorScheme.onSurfaceVariant,
            ),
            const _Separador(),
            _Indicador(
              clave: 'mesa_pedidos_app',
              icono: Icons.shopping_bag_outlined,
              valor: '${mesa.pedidosApp}',
              etiqueta: 'Pedidos app',
              color: mesa.pedidosApp > 0 ? Colors.blue : theme.colorScheme.onSurfaceVariant,
            ),
            const _Separador(),
            _Indicador(
              clave: 'mesa_publicados',
              icono: Icons.storefront_outlined,
              valor: '${mesa.publicados}',
              etiqueta: 'En Mercado',
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const Spacer(),
            IconButton(
              key: const Key('mesa_turno_refresh'),
              tooltip: 'Actualizar mesa',
              onPressed: () => ref.invalidate(mesaTurnoProvider),
              icon: Icon(
                Icons.refresh,
                size: 18,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Indicador extends StatelessWidget {
  const _Indicador({
    required this.clave,
    required this.icono,
    required this.valor,
    required this.etiqueta,
    required this.color,
  });

  final String clave;
  final IconData icono;
  final String valor;
  final String etiqueta;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Row(
        key: Key(clave),
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, size: 18, color: color),
          const SizedBox(width: 6),
          Flexible(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  valor,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  etiqueta,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Separador extends StatelessWidget {
  const _Separador();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Container(
        width: 1,
        height: 28,
        color: Theme.of(context).colorScheme.outlineVariant,
      ),
    );
  }
}
