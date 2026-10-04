import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/clientes_service.dart';
import 'cliente_form_controller.dart';

Future<void> mostrarFormCliente(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _ClienteFormDialog(),
  );
}

class _ClienteFormDialog extends ConsumerStatefulWidget {
  const _ClienteFormDialog();

  @override
  ConsumerState<_ClienteFormDialog> createState() => _ClienteFormDialogState();
}

class _ClienteFormDialogState extends ConsumerState<_ClienteFormDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _telefono;
  bool _cuentaCorriente = false;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController();
    _telefono = TextEditingController();
    Future.microtask(() {
      if (mounted) ref.read(clienteFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    super.dispose();
  }

  Future<void> _crear() async {
    final nombre = _nombre.text.trim();
    final telefono = _telefono.text.trim();
    
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre del cliente.');
    }
    
    setState(() => _validacion = null);
    
    final ok = await ref.read(clienteFormProvider.notifier).crear(
          ClienteInput(
            nombre: nombre,
            telefono: telefono.isNotEmpty ? telefono : null,
            cuentaCorriente: _cuentaCorriente,
          ),
        );
        
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(clienteFormProvider);
    final error = _validacion ?? estado.errorMensaje;

    return AlertDialog(
      title: const Text('Nuevo cliente'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                key: const Key('admin_cliente_nombre'),
                controller: _nombre,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nombre o Razón Social'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_cliente_telefono'),
                controller: _telefono,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Teléfono (opcional)'),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                key: const Key('admin_cliente_cuenta'),
                title: const Text('Habilitar cuenta corriente'),
                subtitle: const Text('Permite compras a crédito.'),
                value: _cuentaCorriente,
                onChanged: (v) => setState(() => _cuentaCorriente = v),
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: estado.enviando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_cliente_guardar'),
          onPressed: estado.enviando ? null : _crear,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Crear'),
        ),
      ],
    );
  }
}
