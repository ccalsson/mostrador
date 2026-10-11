import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/proveedor.dart';
import '../../services/proveedores_service.dart';
import 'proveedor_form_controller.dart';

Future<void> mostrarFormProveedor(
  BuildContext context, {
  Proveedor? existente,
}) {
  return showDialog<void>(
    context: context,
    builder: (_) => _ProveedorFormDialog(existente: existente),
  );
}

class _ProveedorFormDialog extends ConsumerStatefulWidget {
  const _ProveedorFormDialog({this.existente});

  final Proveedor? existente;

  @override
  ConsumerState<_ProveedorFormDialog> createState() =>
      _ProveedorFormDialogState();
}

class _ProveedorFormDialogState extends ConsumerState<_ProveedorFormDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _cuit;
  late final TextEditingController _telefono;
  late final TextEditingController _email;
  late final TextEditingController _direccion;
  late final TextEditingController _observaciones;
  late bool _activo;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    final proveedor = widget.existente;
    _nombre = TextEditingController(text: proveedor?.nombre ?? '');
    _cuit = TextEditingController(text: proveedor?.cuit ?? '');
    _telefono = TextEditingController(text: proveedor?.telefono ?? '');
    _email = TextEditingController(text: proveedor?.email ?? '');
    _direccion = TextEditingController(text: proveedor?.direccion ?? '');
    _observaciones = TextEditingController(
      text: proveedor?.observaciones ?? '',
    );
    _activo = proveedor?.activo ?? true;
    Future.microtask(() {
      if (mounted) ref.read(proveedorFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _cuit.dispose();
    _telefono.dispose();
    _email.dispose();
    _direccion.dispose();
    _observaciones.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre del proveedor.');
    }
    setState(() => _validacion = null);
    final ok = await ref
        .read(proveedorFormProvider.notifier)
        .guardar(
          id: widget.existente?.id,
          input: ProveedorInput(
            nombre: nombre,
            cuit: _cuit.text.trim().isEmpty ? null : _cuit.text.trim(),
            telefono: _telefono.text.trim().isEmpty
                ? null
                : _telefono.text.trim(),
            email: _email.text.trim().isEmpty ? null : _email.text.trim(),
            direccion: _direccion.text.trim().isEmpty
                ? null
                : _direccion.text.trim(),
            observaciones: _observaciones.text.trim().isEmpty
                ? null
                : _observaciones.text.trim(),
            activo: _activo,
          ),
        );
    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          widget.existente == null
              ? 'Proveedor cargado.'
              : 'Proveedor guardado.',
        ),
      ),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(proveedorFormProvider);
    final error = _validacion ?? estado.errorMensaje;
    final productos = widget.existente == null
        ? null
        : ref.watch(productosProveedorProvider(widget.existente!.id));

    return AlertDialog(
      title: Text(widget.existente == null ? 'Nuevo proveedor' : 'Proveedor'),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _campo(
                key: const Key('admin_proveedor_nombre'),
                controller: _nombre,
                label: 'Nombre',
                maxLength: 120,
                requerido: true,
              ),
              _campo(
                key: const Key('admin_proveedor_cuit'),
                controller: _cuit,
                label: 'CUIT',
                maxLength: 20,
              ),
              _campo(
                key: const Key('admin_proveedor_telefono'),
                controller: _telefono,
                label: 'Teléfono',
                maxLength: 40,
                keyboardType: TextInputType.phone,
              ),
              _campo(
                key: const Key('admin_proveedor_email'),
                controller: _email,
                label: 'Email',
                maxLength: 120,
                keyboardType: TextInputType.emailAddress,
              ),
              _campo(
                key: const Key('admin_proveedor_direccion'),
                controller: _direccion,
                label: 'Dirección',
                maxLength: 200,
              ),
              _campo(
                key: const Key('admin_proveedor_observaciones'),
                controller: _observaciones,
                label: 'Observaciones',
                maxLength: 300,
              ),
              if (widget.existente != null)
                SwitchListTile(
                  key: const Key('admin_proveedor_activo'),
                  title: const Text('Activo'),
                  value: _activo,
                  onChanged: estado.enviando
                      ? null
                      : (value) => setState(() => _activo = value),
                ),
              if (productos != null) ...[
                const Divider(),
                const Text(
                  'Productos en sus remitos',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                productos.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (error, _) => Text(
                    error is ApiException
                        ? error.message
                        : 'No se pudieron cargar los productos.',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  data: (nombres) => nombres.isEmpty
                      ? const Text(
                          'Todavía no hay remitos confirmados de este proveedor.',
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (final nombre in nombres)
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 2,
                                ),
                                child: Text(nombre),
                              ),
                          ],
                        ),
                ),
              ],
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
          child: const Text('Cerrar'),
        ),
        FilledButton(
          key: const Key('admin_proveedor_guardar'),
          onPressed: estado.enviando ? null : _guardar,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Guardar'),
        ),
      ],
    );
  }

  Widget _campo({
    required Key key,
    required TextEditingController controller,
    required String label,
    required int maxLength,
    bool requerido = false,
    TextInputType? keyboardType,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: controller,
        maxLength: maxLength,
        keyboardType: keyboardType,
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
        ),
      ),
    );
  }
}
