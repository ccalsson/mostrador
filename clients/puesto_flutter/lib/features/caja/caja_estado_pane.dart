import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/caja.dart';
import '../../services/caja_service.dart';
import 'error_caja.dart';

/// Estado del turno de caja (`GET /api/v1/caja`): total esperado, totales por
/// forma de pago y últimos cobros, tal cual los devuelve el backend. Sólo
/// lectura; el cierre de caja es de la Fase 4.2.2.
class CajaEstadoPane extends ConsumerWidget {
  const CajaEstadoPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estado = ref.watch(cajaEstadoProvider);
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
                child: Text(
                  'Esperado en caja: ${moneda(caja.esperado)}',
                  key: const Key('caja_estado_esperado'),
                  style: Theme.of(context).textTheme.titleLarge,
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
                    trailing: Text(
                      '${moneda(total.total)} · ${total.n} '
                      '${total.n == 1 ? 'cobro' : 'cobros'}',
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

class _FilaCobro extends StatelessWidget {
  const _FilaCobro({required this.cobro});

  final UltimoCobro cobro;

  @override
  Widget build(BuildContext context) {
    final estilo = Theme.of(context).textTheme.bodyMedium;
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
            child: Text(
              moneda(cobro.monto),
              style: estilo,
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}
