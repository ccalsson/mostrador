import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/tema.dart';
import '../../models/clima_dolar.dart';
import '../../services/clima_dolar_service.dart';

/// Elemento compacto inline con cotización del dólar blue y clima del
/// Mercado Central. Paridad con `src/components/clima-dolar.tsx`.
///
/// Se coloca dentro del [_TopBar] a la derecha. Si falla la carga muestra
/// "N/A" en lugar de un error disruptivo.
class ClimaDolarWidget extends ConsumerWidget {
  const ClimaDolarWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final climaAsync = ref.watch(climaDolarProvider);
    final tokens = context.tokens;
    final theme = Theme.of(context);

    void reintentar() => ref.invalidate(climaDolarProvider);

    return climaAsync.when(
      loading: () => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            color: tokens.leafFg.withValues(alpha: 0.5),
          ),
        ),
      ),
      error: (e, s) => _ContenidoNulo(
        theme: theme,
        tokens: tokens,
        onRefresh: reintentar,
      ),
      data: (dato) => _Contenido(
        dato: dato,
        theme: theme,
        tokens: tokens,
        onRefresh: reintentar,
      ),
    );
  }
}

/// Muestra los datos cuando la carga fue exitosa.
class _Contenido extends StatelessWidget {
  const _Contenido({
    required this.dato,
    required this.theme,
    required this.tokens,
    required this.onRefresh,
  });

  final ClimaDolar dato;
  final ThemeData theme;
  final TokensMostrador tokens;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final colorClima = _colorSegunCondicion(dato.condicion);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(width: 8),
        // Clima
        Icon(_iconoClima(dato.condicion), size: 14, color: colorClima),
        const SizedBox(width: 2),
        Text(
          '${dato.temperatura}°',
          key: const Key('clima_temperatura'),
          style: theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: tokens.leafFg,
            fontSize: 11,
          ),
        ),
        const SizedBox(width: 8),
        // Separador
        Container(
          width: 1,
          height: 14,
          color: tokens.leafFg.withValues(alpha: 0.2),
        ),
        const SizedBox(width: 8),
        // Dólar blue
        Icon(Icons.attach_money, size: 14, color: tokens.ambar),
        const SizedBox(width: 2),
        Text(
          '\$${dato.dolarBlueVenta.toStringAsFixed(0)}',
          key: const Key('dolar_blue_venta'),
          style: theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: tokens.leafFg,
            fontSize: 11,
          ),
        ),
        const SizedBox(width: 4),
        // Botón refresh
        IconButton(
          key: const Key('clima_dolar_refresh'),
          tooltip: 'Actualizar clima y dólar',
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
          padding: EdgeInsets.zero,
          onPressed: onRefresh,
          icon: Icon(
            Icons.refresh,
            size: 14,
            color: tokens.leafFg.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}

/// Muestra "N/A" cuando la carga falla.
class _ContenidoNulo extends StatelessWidget {
  const _ContenidoNulo({
    required this.theme,
    required this.tokens,
    required this.onRefresh,
  });

  final ThemeData theme;
  final TokensMostrador tokens;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(width: 8),
        Icon(Icons.cloud_off_outlined,
            size: 14, color: tokens.leafFg.withValues(alpha: 0.4)),
        const SizedBox(width: 2),
        Text(
          'N/A',
          key: const Key('clima_dolar_na'),
          style: theme.textTheme.bodySmall?.copyWith(
            color: tokens.leafFg.withValues(alpha: 0.5),
            fontSize: 11,
          ),
        ),
        const SizedBox(width: 4),
        IconButton(
          key: const Key('clima_dolar_refresh'),
          tooltip: 'Reintentar',
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
          padding: EdgeInsets.zero,
          onPressed: onRefresh,
          icon: Icon(
            Icons.refresh,
            size: 14,
            color: tokens.leafFg.withValues(alpha: 0.6),
          ),
        ),
      ],
    );
  }
}

/// Ícono según la condición climática.
IconData _iconoClima(String condicion) {
  return switch (condicion) {
    'despejado' => Icons.wb_sunny_outlined,
    'nublado' => Icons.cloud_outlined,
    'niebla' => Icons.visibility_outlined,
    'lluvia' || 'chaparrón' => Icons.grain_outlined,
    'nieve' => Icons.ac_unit_outlined,
    'tormenta' => Icons.flash_on_outlined,
    _ => Icons.cloud_outlined,
  };
}

/// Color según la condición climática
/// (soleado=naranja, nublado=gris, lluvia=azul).
Color _colorSegunCondicion(String condicion) {
  return switch (condicion) {
    'despejado' => const Color(0xFFE67E22),
    'nublado' => const Color(0xFF7F8C8D),
    'niebla' => const Color(0xFF95A5A6),
    'lluvia' || 'chaparrón' => const Color(0xFF2980B9),
    'nieve' => const Color(0xFF3498DB),
    'tormenta' => const Color(0xFF8E44AD),
    _ => const Color(0xFF7F8C8D),
  };
}
