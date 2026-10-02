import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/cobro.dart';
import '../../models/pedido.dart';
import 'cobro_controller.dart';

/// Diálogo de cobro: el total sale del pedido del backend y la estimación de
/// vuelto es sólo local; tras confirmar manda la respuesta real del backend.
/// No se cierra mientras hay una petición en curso (mismo clic = un cobro).
class CobroDialog extends ConsumerStatefulWidget {
  const CobroDialog({super.key, required this.pedido});

  final Pedido pedido;

  @override
  ConsumerState<CobroDialog> createState() => _CobroDialogState();
}

class _CobroDialogState extends ConsumerState<CobroDialog> {
  FormaPago _forma = FormaPago.efectivo;
  late final TextEditingController _recibido =
      TextEditingController(text: widget.pedido.total.toStringAsFixed(2));
  bool _cerrado = false;

  @override
  void dispose() {
    _recibido.dispose();
    super.dispose();
  }

  double? get _monto => parseDecimal(_recibido.text);

  double get _total => widget.pedido.total;

  /// Estimación local; el vuelto definitivo llega en la respuesta del cobro.
  double? get _vueltoEstimado {
    final monto = _monto;
    if (monto == null || monto < _total) return null;
    return redondear2(monto - _total);
  }

  bool get _valido {
    if (!_forma.admiteRecibido) return true;
    final monto = _monto;
    return monto != null && monto >= _total;
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final cobro = ref.watch(cobroControllerProvider(widget.pedido.id));
    ref.listen(cobroControllerProvider(widget.pedido.id), (anterior, siguiente) {
      if (siguiente.exito && !_cerrado) {
        _cerrado = true;
        Navigator.pop(context);
      }
    });
    return AlertDialog(
      key: const Key('cobro_dialogo'),
      title: const Text('Cobrar pedido'),
      content: SizedBox(
        width: 380,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Total: ${moneda(_total)}',
              key: const Key('cobro_total'),
              style: tema.textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final forma in FormaPago.values)
                  ChoiceChip(
                    key: Key('cobro_forma_${forma.apiValue}'),
                    label: Text(forma.label),
                    selected: _forma == forma,
                    onSelected: cobro.enviando
                        ? null
                        : (_) => setState(() => _forma = forma),
                  ),
              ],
            ),
            if (_forma.admiteRecibido) ...[
              const SizedBox(height: 12),
              TextField(
                key: const Key('cobro_recibido'),
                controller: _recibido,
                enabled: !cobro.enviando,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Importe recibido',
                  prefixText: '\$ ',
                  errorText: _monto == null ? 'Importe inválido' : null,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text('Vuelto', style: tema.textTheme.titleMedium),
                ),
                Text(
                  _forma.admiteRecibido
                      ? (_monto == null
                          ? '—'
                          : _vueltoEstimado == null
                              ? 'Insuficiente'
                              : moneda(_vueltoEstimado!))
                      : moneda(0),
                  key: const Key('cobro_vuelto'),
                  style: tema.textTheme.titleMedium,
                ),
              ],
            ),
            if (cobro.fase == CobroFase.error) ...[
              const SizedBox(height: 12),
              _ErrorCobro(mensaje: cobro.errorMensaje),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          key: const Key('cobro_cancelar'),
          onPressed: cobro.enviando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('cobro_confirmar'),
          onPressed: (cobro.enviando || !_valido) ? null : _confirmar,
          child: cobro.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Confirmar cobro'),
        ),
      ],
    );
  }

  void _confirmar() {
    ref
        .read(cobroControllerProvider(widget.pedido.id).notifier)
        .cobrar(formaPago: _forma, montoRecibido: _forma.admiteRecibido ? _monto : null);
  }
}

class _ErrorCobro extends StatelessWidget {
  const _ErrorCobro({this.mensaje});

  final String? mensaje;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('cobro_error'),
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Text(
          mensaje ?? 'No se pudo registrar el cobro.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
        ),
      ),
    );
  }
}
