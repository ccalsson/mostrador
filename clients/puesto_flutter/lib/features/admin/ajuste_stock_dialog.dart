import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/producto.dart';
import 'ajuste_stock_controller.dart';

/// Diálogo de ajuste/merma de stock de un producto.
Future<void> mostrarAjusteStock(BuildContext context, Producto producto) {
  return showDialog<void>(
    context: context,
    builder: (_) => _AjusteStockDialog(producto: producto),
  );
}

class _AjusteStockDialog extends ConsumerStatefulWidget {
  const _AjusteStockDialog({required this.producto});

  final Producto producto;

  @override
  ConsumerState<_AjusteStockDialog> createState() => _AjusteStockDialogState();
}

class _AjusteStockDialogState extends ConsumerState<_AjusteStockDialog> {
  final TextEditingController _cantidad = TextEditingController();
  final TextEditingController _motivo = TextEditingController();
  AjusteModo _modo = AjusteModo.sumar;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) ref.read(ajusteStockProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _cantidad.dispose();
    _motivo.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    final cantidad = parseDecimal(_cantidad.text);
    final motivo = _motivo.text.trim();
    if (cantidad == null || cantidad <= 0) {
      return setState(() => _validacion = 'Cantidad inválida.');
    }
    if (motivo.isEmpty) {
      return setState(() => _validacion = 'Ingresá el motivo.');
    }
    if (motivo.length > 200) {
      return setState(() => _validacion = 'Motivo: máx. 200 caracteres.');
    }
    setState(() => _validacion = null);
    final ok = await ref.read(ajusteStockProvider.notifier).ajustar(
          productoId: widget.producto.id,
          modo: _modo,
          cantidad: cantidad,
          motivo: motivo,
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(ajusteStockProvider);
    final error = _validacion ?? estado.errorMensaje;
    return AlertDialog(
      title: Text('Ajustar stock · ${widget.producto.nombre}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Stock actual: ${cantidadNum(widget.producto.stock)}'
              ' ${widget.producto.unidadLabel}',
            ),
            const SizedBox(height: 12),
            SegmentedButton<AjusteModo>(
              segments: const [
                ButtonSegment(
                  value: AjusteModo.sumar,
                  label: Text('Sumar'),
                ),
                ButtonSegment(
                  value: AjusteModo.restar,
                  label: Text('Restar'),
                ),
                ButtonSegment(
                  value: AjusteModo.merma,
                  label: Text('Merma'),
                ),
              ],
              selected: {_modo},
              onSelectionChanged: (seleccion) =>
                  setState(() => _modo = seleccion.first),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_ajuste_cantidad'),
              controller: _cantidad,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Cantidad (${widget.producto.unidadLabel})',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_ajuste_motivo'),
              controller: _motivo,
              maxLength: 200,
              decoration: const InputDecoration(
                labelText: 'Motivo',
                counterText: '',
              ),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error,
                key: const Key('admin_ajuste_error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: estado.enviando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_ajuste_guardar'),
          onPressed: estado.enviando ? null : _registrar,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Registrar'),
        ),
      ],
    );
  }
}
