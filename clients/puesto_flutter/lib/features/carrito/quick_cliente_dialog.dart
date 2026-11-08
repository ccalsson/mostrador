import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/cliente.dart';
import '../../services/clientes_service.dart';

/// Diálogo rápido para dar de alta un cliente nuevo desde el carrito.
/// Paridad con el componente web `QuickCliente` de `vendedor.tsx`.
///
/// Campos: nombre (obligatorio), teléfono (opcional). Al crear exitosamente
/// devuelve el [Cliente] creado; si se cancela, devuelve `null`.
class QuickClienteDialog extends ConsumerStatefulWidget {
  const QuickClienteDialog({super.key});

  @override
  ConsumerState<QuickClienteDialog> createState() => _QuickClienteDialogState();
}

class _QuickClienteDialogState extends ConsumerState<QuickClienteDialog> {
  final _nombreCtrl = TextEditingController();
  final _telefonoCtrl = TextEditingController();
  final _telefonoFocus = FocusNode();
  final _formKey = GlobalKey<FormState>();
  bool _guardando = false;
  String? _error;

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _telefonoCtrl.dispose();
    _telefonoFocus.dispose();
    super.dispose();
  }

  Future<void> _crear() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      final cliente = await ref.read(clientesServiceProvider).crear(
            ClienteInput(
              nombre: _nombreCtrl.text.trim(),
              telefono: _telefonoCtrl.text.trim().isEmpty
                  ? null
                  : _telefonoCtrl.text.trim(),
              cuentaCorriente: false,
            ),
          );
      if (!mounted) return;
      // Invalidar la lista de clientes para que aparezca el nuevo.
      ref.invalidate(clientesProvider);
      Navigator.of(context).pop(cliente);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'No se pudo dar de alta el cliente.');
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return AlertDialog(
      title: const Text('Nuevo cliente'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _error!,
                  style: TextStyle(color: tema.colorScheme.error),
                ),
              ),
            TextFormField(
              key: const Key('quick_cliente_nombre'),
              controller: _nombreCtrl,
              autofocus: true,
              enabled: !_guardando,
              decoration: const InputDecoration(
                labelText: 'Nombre *',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'El nombre es obligatorio' : null,
              onFieldSubmitted: (_) => _telefonoFocus.requestFocus(),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('quick_cliente_telefono'),
              controller: _telefonoCtrl,
              focusNode: _telefonoFocus,
              enabled: !_guardando,
              decoration: const InputDecoration(
                labelText: 'Teléfono (opcional)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.phone,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _guardando ? null : () => Navigator.of(context).pop(null),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('quick_cliente_crear'),
          onPressed: _guardando ? null : _crear,
          child: _guardando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Crear y seleccionar'),
        ),
      ],
    );
  }
}
