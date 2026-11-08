import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/caja.dart';
import '../../services/caja_service.dart';
import '../../services/anulaciones_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/facturacion_service.dart';
import '../../services/pedidos_service.dart';
import 'anulacion_dialog.dart';
import 'cierre_controller.dart';
import 'cierre_dialog.dart';
import 'error_caja.dart';

/// Estado del turno de caja (`GET /api/v1/caja`): total esperado, totales por
/// forma de pago y últimos cobros, tal cual los devuelve el backend; todo,
/// incluido el cierre, lo calcula el servidor.
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
                subtitle: Text(
                  'Caja: ${caja.id}',
                  key: const Key('caja_estado_id'),
                ),
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
                      child: Text(
                        'Esperado en caja: ${moneda(caja.esperado)}',
                        key: const Key('caja_estado_esperado'),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    if (caja.egresos > 0)
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: Text(
                          'Egresos: ${moneda(caja.egresos)}',
                          key: const Key('caja_estado_egresos'),
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.error,
                              ),
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

class _FilaCobro extends ConsumerStatefulWidget {
  const _FilaCobro({required this.cobro});

  final UltimoCobro cobro;

  @override
  ConsumerState<_FilaCobro> createState() => _FilaCobroState();
}

class _FilaCobroState extends ConsumerState<_FilaCobro> {
  bool _enviando = false;
  bool _facturando = false;

  @override
  Widget build(BuildContext context) {
    final estilo = Theme.of(context).textTheme.bodyMedium;
    final cobro = widget.cobro;
    // Gap 4: config AFIP para saber si está habilitada la facturación.
    final afipAsync = ref.watch(afipConfigProvider);
    final afip = afipAsync.value;
    return Padding(
      key: Key('caja_mov_fila_${cobro.id}'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
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
          // --- Gap 4: facturación electrónica inline ---
          if (cobro.facturaId != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                key: Key('caja_ver_factura_${cobro.id}'),
                onPressed: () => _mostrarFactura(context, cobro.facturaId!),
                icon: const Icon(Icons.receipt_long, size: 18),
                label: Text(
                  cobro.cae != null
                      ? 'Ver factura · CAE ${cobro.cae}'
                      : 'Ver factura',
                ),
              ),
            )
          else if (afip?.habilitada == true)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                key: Key('caja_facturar_${cobro.id}'),
                onPressed: _facturando ? null : () => _emitirFactura(cobro.id),
                icon: _facturando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fact_check_outlined, size: 18),
                label: Text(
                  afip?.ambiente == 'homo'
                      ? 'Factura de prueba'
                      : 'Factura electrónica',
                ),
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              key: Key('caja_anular_cobro_${cobro.id}'),
              onPressed: _enviando ? null : _anularCobro,
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Anular venta'),
            ),
          ),
        ],
      ),
    );
  }

  /// Gap 4: muestra la factura en un diálogo simple con los datos del CAE.
  void _mostrarFactura(BuildContext context, String facturaId) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => _DialogoFactura(facturaId: facturaId),
    );
  }

  /// Gap 4: emite factura electrónica para un cobro sin factura.
  Future<void> _emitirFactura(String cobroId) async {
    setState(() => _facturando = true);
    try {
      final factura = await ref
          .read(facturacionServiceProvider)
          .emitirFactura(cobroId);
      if (!mounted) return;
      ref.invalidate(cajaEstadoProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${factura.tipoLabel} · CAE ${factura.cae ?? "—"}'
            '${factura.ambiente == "homo" ? " (prueba)" : ""}',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo emitir la factura.')),
        );
      }
    } finally {
      if (mounted) setState(() => _facturando = false);
    }
  }

  Future<void> _anularCobro() async {
    final cobro = widget.cobro;
    final motivo = await pedirMotivoAnulacion(
      context,
      titulo: 'Anular venta',
      descripcion: cobro.facturaId == null
          ? 'Se reintegrará el stock y se revertirá la cuenta corriente si corresponde.'
          : 'La venta tiene factura electrónica. El backend exige emitir una nota de crédito antes de anular.',
      confirmar: 'Anular venta',
    );
    if (motivo == null || !mounted) return;
    setState(() => _enviando = true);
    try {
      await ref
          .read(anulacionesServiceProvider)
          .cobro(cobro.id, motivo: motivo);
      if (!mounted) return;
      ref.invalidate(cajaEstadoProvider);
      ref.invalidate(pedidosColaProvider);
      ref.invalidate(catalogoProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Venta anulada. Volvió el stock.')),
      );
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo anular la venta.')),
        );
      }
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

// ---------------------------------------------------------------------------
// Gap 4: diálogo con los datos de una factura emitida
// ---------------------------------------------------------------------------

class _DialogoFactura extends ConsumerWidget {
  const _DialogoFactura({required this.facturaId});

  final String facturaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final facturaAsync = ref.watch(facturaProvider(facturaId));
    final tema = Theme.of(context);
    return AlertDialog(
      key: const Key('dialogo_factura'),
      title: const Text('Factura electrónica'),
      content: SizedBox(
        width: 400,
        child: facturaAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Text('Error: $e'),
          data: (factura) => SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${factura.tipoLabel} ${factura.numeroFiscal}',
                  style: tema.textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text('Fecha: ${factura.fecha}'),
                Text('Receptor: ${factura.receptorNombre ?? "—"}'),
                if (factura.receptorCondicion != null)
                  Text('Condición: ${factura.receptorCondicion}'),
                const Divider(),
                Text('Neto: ${moneda(factura.neto)}'),
                Text('IVA: ${moneda(factura.iva)}'),
                Text(
                  'Total: ${moneda(factura.total)}',
                  style: tema.textTheme.titleSmall,
                ),
                const Divider(),
                Text('CAE: ${factura.cae ?? "—"}'),
                if (factura.caeVto != null) Text('Vto. CAE: ${factura.caeVto}'),
                if (factura.ambiente == 'homo')
                  Text(
                    'Ambiente: Homologación (sin validez fiscal)',
                    style: tema.textTheme.bodySmall?.copyWith(
                      color: tema.colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }
}
