import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/caja.dart';
import '../../services/caja_service.dart';
import 'caja_pane.dart';
import 'caja_providers.dart';
import 'cierre_controller.dart';
import 'cierre_dialog.dart';
import 'error_caja.dart';

/// Estado del turno de caja (`GET /api/v1/caja`): total esperado, totales por
/// forma de pago y últimos cobros, tal cual los devuelve el backend; todo,
/// incluido el cierre, lo calcula el servidor. Incluye animación de flash
/// cuando cambia el monto esperado.
class CajaEstadoPane extends ConsumerStatefulWidget {
  const CajaEstadoPane({super.key});

  @override
  ConsumerState<CajaEstadoPane> createState() => _CajaEstadoPaneState();
}

class _CajaEstadoPaneState extends ConsumerState<CajaEstadoPane>
    with SingleTickerProviderStateMixin {
  late final AnimationController _flashController;
  late final Animation<double> _flashAnimation;
  double? _prevEsperado;
  Timer? _flashTimer;

  @override
  void initState() {
    super.initState();
    _flashController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    _flashAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _flashController, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _flashController.dispose();
    super.dispose();
  }

  void _dispararFlash() {
    _flashController.forward(from: 0.0);
    _flashTimer?.cancel();
    _flashTimer = Timer(const Duration(milliseconds: 200), () {
      if (mounted) _flashController.reverse();
    });
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(cajaEstadoProvider);
    final mostrarMontos = ref.watch(mostrarMontosProvider);

    // Flash visual cuando cambia el esperado (gap 5).
    final esperado = estado.value?.esperado;
    if (esperado != null && _prevEsperado != null && esperado != _prevEsperado) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _dispararFlash());
    }
    _prevEsperado = esperado;
    if (estado.isLoading && !estado.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('caja_estado_cargando')),
      );
    }
    final caja = estado.value;
    if (caja == null) {
      final error = estado.error;
      return ErrorCaja(
        mensaje: error is ApiException
            ? error.message
            : 'No se pudo cargar el estado de caja.',
        onReintentar: () => ref.invalidate(cajaEstadoProvider),
        claveReintentar: const Key('caja_estado_reintentar'),
      );
    }
    return AnimatedBuilder(
      animation: _flashAnimation,
      builder: (context, child) {
        final flashColor = Color.lerp(
          Colors.transparent,
          Theme.of(context).colorScheme.primaryContainer,
          _flashAnimation.value,
        );
        return Container(
          color: flashColor,
          child: child,
        );
      },
      child: _contenido(context, ref, caja, estado, mostrarMontos),
    );
  }

  Widget _contenido(
    BuildContext context,
    WidgetRef ref,
    CajaEstado caja,
    AsyncValue<CajaEstado> estado,
    bool mostrarMontos,
  ) {
    return Column(
      children: [
        if (estado.isRefreshing)
          const LinearProgressIndicator(key: Key('caja_estado_refrescando')),
        Expanded(
          child: ListView(
            key: const Key('caja_estado_contenido'),
            children: [
              ListTile(
                title: Text(
                  'Turno abierto desde: ${fechaCorta(caja.abiertoAt)}',
                  key: const Key('caja_estado_abierto'),
                ),
                subtitle: Text('Caja: ${caja.id}', key: const Key('caja_estado_id')),
                trailing: IconButton(
                  key: const Key('caja_estado_refrescar'),
                  tooltip: 'Actualizar estado de caja',
                  onPressed: estado.isRefreshing
                      ? null
                      : () => ref.invalidate(cajaEstadoProvider),
                  icon: const Icon(Icons.refresh),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Text('Esperado en caja: ',
                              style: Theme.of(context).textTheme.titleLarge),
                          Flexible(
                            child: MontoOculto(
                              key: const Key('caja_estado_esperado'),
                              monto: caja.esperado,
                              visible: mostrarMontos,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilledButton.icon(
                      key: const Key('caja_cerrar'),
                      onPressed: estado.isRefreshing
                          ? null
                          : () => _abrirCierre(context, ref, caja),
                      icon: const Icon(Icons.point_of_sale),
                      label: const Text('Cerrar caja'),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Text(
                  'Cobrado por forma de pago',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (caja.totales.isEmpty)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Text(
                    'Sin cobros en el turno.',
                    key: Key('caja_estado_sin_totales'),
                  ),
                )
              else
                for (final total in caja.totales)
                  ListTile(
                    key: Key('caja_estado_total_${total.formaPagoApi}'),
                    dense: true,
                    title: Text(total.formaPagoLabel),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        MontoOculto(
                          monto: total.total,
                          visible: mostrarMontos,
                        ),
                        Text(' · ${total.n} ${total.n == 1 ? 'cobro' : 'cobros'}'),
                      ],
                    ),
                  ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  'Últimos cobros del turno',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (caja.ultimos.isEmpty)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Text(
                    'Sin movimientos en el turno.',
                    key: Key('caja_estado_sin_movimientos'),
                  ),
                )
              else ...[
                const _CabeceraMovimientos(),
                for (final cobro in caja.ultimos) _FilaCobro(cobro: cobro),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }

  /// Diálogo de cierre: el esperado sale del estado actual del backend. Se
  /// descarta el estado anterior del controller (nuevo intento lógico).
  Future<void> _abrirCierre(
    BuildContext context,
    WidgetRef ref,
    CajaEstado caja,
  ) async {
    ref.invalidate(cierreControllerProvider(caja.id));
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => CierreCajaDialog(caja: caja),
    );
  }
}

/// Columnas visibles = campos reales del contrato (`ultimos`): fecha, cliente,
/// forma de pago, número de ticket y monto. `facturaId`/`cae` se parsean pero
/// no se muestran: facturación queda fuera del alcance de esta fase.
class _CabeceraMovimientos extends StatelessWidget {
  const _CabeceraMovimientos();

  @override
  Widget build(BuildContext context) {
    final estilo = Theme.of(context).textTheme.labelLarge;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Row(
        children: [
          Expanded(flex: 3, child: Text('Fecha y hora', style: estilo)),
          Expanded(flex: 4, child: Text('Cliente', style: estilo)),
          Expanded(flex: 3, child: Text('Forma de pago', style: estilo)),
          Expanded(
            flex: 2,
            child: Text('Nº', style: estilo, textAlign: TextAlign.right),
          ),
          Expanded(
            flex: 3,
            child: Text('Monto', style: estilo, textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _FilaCobro extends ConsumerWidget {
  const _FilaCobro({required this.cobro});

  final UltimoCobro cobro;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estilo = Theme.of(context).textTheme.bodyMedium;
    final mostrarMontos = ref.watch(mostrarMontosProvider);
    return Padding(
      key: Key('caja_mov_fila_${cobro.id}'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(fechaCorta(cobro.createdAt), style: estilo),
          ),
          Expanded(
            flex: 4,
            child: Text(
              cobro.cliente,
              style: estilo,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(cobro.formaPagoLabel, style: estilo),
          ),
          Expanded(
            flex: 2,
            child: Text(
              cobro.numero != null ? 'Nº ${cobro.numero}' : '—',
              style: estilo,
              textAlign: TextAlign.right,
            ),
          ),
          Expanded(
            flex: 3,
            child: MontoOculto(
              monto: cobro.monto,
              visible: mostrarMontos,
              style: estilo,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}
