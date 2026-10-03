import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/caja.dart';
import '../../services/caja_service.dart';
import 'cierre_controller.dart';

/// Diálogo de cierre de caja: el esperado viene del estado del backend y el
/// cajero ingresa el total contado y una nota opcional. Al confirmar, el
/// backend cierra el turno (alerta si hay diferencia) y abre uno nuevo; el
/// resultado se muestra en el mismo diálogo hasta pulsar "Listo".
class CierreCajaDialog extends ConsumerStatefulWidget {
  const CierreCajaDialog({super.key, required this.caja});

  final CajaEstado caja;

  @override
  ConsumerState<CierreCajaDialog> createState() => _CierreCajaDialogState();
}

class _CierreCajaDialogState extends ConsumerState<CierreCajaDialog> {
  late final TextEditingController _contado =
      TextEditingController(text: widget.caja.esperado.toStringAsFixed(2));
  late final TextEditingController _notas = TextEditingController();

  @override
  void dispose() {
    _contado.dispose();
    _notas.dispose();
    super.dispose();
  }

  double? get _monto => parseDecimal(_contado.text);

  void _cancelar() {
    // Un error pudo ocurrir después de que el backend ya cerró el turno
    // (p. ej. timeout al recibir la respuesta): releer evita mostrar un
    // turno cerrado como si siguiera abierto.
    if (ref.read(cierreControllerProvider(widget.caja.id)).fase ==
        CierreFase.error) {
      ref.invalidate(cajaEstadoProvider);
    }
    Navigator.pop(context);
  }

  void _confirmar() {
    final monto = _monto;
    if (monto == null) return;
    ref
        .read(cierreControllerProvider(widget.caja.id).notifier)
        .cerrar(real: monto, notas: _notas.text);
  }

  @override
  Widget build(BuildContext context) {
    final cierre = ref.watch(cierreControllerProvider(widget.caja.id));
    final resultado = cierre.resultado;
    return AlertDialog(
      key: const Key('cierre_dialogo'),
      title: const Text('Cerrar caja'),
      content: SizedBox(
        width: 420,
        child: resultado == null
            ? _FormularioCierre(
                esperado: widget.caja.esperado,
                contado: _contado,
                notas: _notas,
                habilitado: !cierre.enviando,
                montoValido: _monto != null,
                errorMensaje:
                    cierre.fase == CierreFase.error ? cierre.errorMensaje : null,
                onChanged: () => setState(() {}),
              )
            : _ResultadoCierre(resultado: resultado, contado: cierre.contado),
      ),
      actions: resultado == null
          ? [
              TextButton(
                key: const Key('cierre_cancelar'),
                onPressed: cierre.enviando ? null : _cancelar,
                child: const Text('Cancelar'),
              ),
              FilledButton(
                key: const Key('cierre_confirmar'),
                onPressed: (cierre.enviando || _monto == null) ? null : _confirmar,
                child: cierre.enviando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Confirmar cierre'),
              ),
            ]
          : [
              FilledButton(
                key: const Key('cierre_listo'),
                onPressed: () => Navigator.pop(context),
                child: const Text('Listo'),
              ),
            ],
    );
  }
}

class _FormularioCierre extends StatelessWidget {
  const _FormularioCierre({
    required this.esperado,
    required this.contado,
    required this.notas,
    required this.habilitado,
    required this.montoValido,
    required this.errorMensaje,
    required this.onChanged,
  });

  final double esperado;
  final TextEditingController contado;
  final TextEditingController notas;
  final bool habilitado;
  final bool montoValido;
  final String? errorMensaje;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Esperado en caja: ${moneda(esperado)}',
            key: const Key('cierre_esperado'),
            style: tema.textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('cierre_contado'),
            controller: contado,
            enabled: habilitado,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => onChanged(),
            decoration: InputDecoration(
              labelText: 'Total contado',
              prefixText: '\$ ',
              errorText: montoValido ? null : 'Importe inválido',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('cierre_notas'),
            controller: notas,
            enabled: habilitado,
            maxLength: 300,
            minLines: 1,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notas (opcional)'),
          ),
          Text(
            'Al confirmar se registra el arqueo, se alerta si hay diferencia '
            'y se abre un turno nuevo automáticamente.',
            key: const Key('cierre_aviso'),
            style: tema.textTheme.bodySmall,
          ),
          if (errorMensaje != null) ...[
            const SizedBox(height: 12),
            _ErrorCierre(mensaje: errorMensaje),
          ],
        ],
      ),
    );
  }
}

class _ResultadoCierre extends StatelessWidget {
  const _ResultadoCierre({required this.resultado, required this.contado});

  final CierreCajaResultado resultado;
  final double? contado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final hayDiferencia = resultado.diferencia != 0;
    return Column(
      key: const Key('cierre_resultado'),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('El turno quedó cerrado.', style: tema.textTheme.titleMedium),
        const SizedBox(height: 12),
        Text(
          'Esperado: ${moneda(resultado.esperado)}',
          key: const Key('cierre_resultado_esperado'),
        ),
        if (contado != null)
          Text(
            'Contado: ${moneda(contado!)}',
            key: const Key('cierre_resultado_contado'),
          ),
        Text(
          'Diferencia: ${moneda(resultado.diferencia)}',
          key: const Key('cierre_resultado_diferencia'),
          style: hayDiferencia
              ? tema.textTheme.titleMedium?.copyWith(color: tema.colorScheme.error)
              : tema.textTheme.bodyMedium,
        ),
        if (hayDiferencia) ...[
          const SizedBox(height: 8),
          Text(
            'Se registró una alerta por la diferencia.',
            key: const Key('cierre_resultado_alerta'),
            style: TextStyle(color: tema.colorScheme.error),
          ),
        ],
      ],
    );
  }
}

class _ErrorCierre extends StatelessWidget {
  const _ErrorCierre({this.mensaje});

  final String? mensaje;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('cierre_error'),
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Text(
          mensaje ?? 'No se pudo cerrar la caja.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
        ),
      ),
    );
  }
}
