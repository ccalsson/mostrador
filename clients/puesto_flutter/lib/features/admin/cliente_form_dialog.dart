import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/cliente.dart';
import '../../services/clientes_service.dart';
import 'cliente_form_controller.dart';

const _condicionesIva = {
  'ri': 'IVA responsable inscripto',
  'monotributo': 'Responsable monotributo',
  'exento': 'IVA sujeto exento',
  'consumidor_final': 'Consumidor final',
};

Future<void> mostrarFormCliente(BuildContext context, {Cliente? existente}) {
  return showDialog<void>(
    context: context,
    builder: (_) => _ClienteFormDialog(existente: existente),
  );
}

class _ClienteFormDialog extends ConsumerStatefulWidget {
  const _ClienteFormDialog({this.existente});

  final Cliente? existente;

  @override
  ConsumerState<_ClienteFormDialog> createState() => _ClienteFormDialogState();
}

class _ClienteFormDialogState extends ConsumerState<_ClienteFormDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _telefono;
  late final TextEditingController _cuit;
  late final TextEditingController _direccion;
  late bool _cuentaCorriente;
  late bool _activo;
  late String _condicionIva;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    final cliente = widget.existente;
    _nombre = TextEditingController(text: cliente?.nombre ?? '');
    _telefono = TextEditingController(text: cliente?.telefono ?? '');
    _cuit = TextEditingController(text: cliente?.cuit ?? '');
    _direccion = TextEditingController(text: cliente?.direccion ?? '');
    _cuentaCorriente = cliente?.cuentaCorriente ?? false;
    _activo = cliente?.activo ?? true;
    _condicionIva = _condicionesIva.containsKey(cliente?.condicionIva)
        ? cliente!.condicionIva
        : 'consumidor_final';
    Future.microtask(() {
      if (mounted) ref.read(clienteFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    _cuit.dispose();
    _direccion.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    final telefono = _telefono.text.trim();

    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre del cliente.');
    }

    setState(() => _validacion = null);

    final controller = ref.read(clienteFormProvider.notifier);
    final ok = widget.existente == null
        ? await controller.crear(
            ClienteInput(
              nombre: nombre,
              telefono: telefono.isNotEmpty ? telefono : null,
              cuentaCorriente: _cuentaCorriente,
            ),
          )
        : await controller.actualizar(
            widget.existente!.id,
            ClienteActualizacionInput(
              nombre: nombre,
              telefono: telefono.isNotEmpty ? telefono : null,
              cuit: _cuit.text.trim().isNotEmpty ? _cuit.text.trim() : null,
              direccion: _direccion.text.trim().isNotEmpty
                  ? _direccion.text.trim()
                  : null,
              cuentaCorriente: _cuentaCorriente,
              condicionIva: _condicionIva,
              activo: _activo,
            ),
          );

    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(clienteFormProvider);
    final error = _validacion ?? estado.errorMensaje;

    return AlertDialog(
      title: Text(
        widget.existente == null ? 'Nuevo cliente' : 'Editar cliente',
      ),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                key: const Key('admin_cliente_nombre'),
                controller: _nombre,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Nombre o Razón Social',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_cliente_telefono'),
                controller: _telefono,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Teléfono (opcional)',
                ),
              ),
              if (widget.existente != null) ...[
                const SizedBox(height: 12),
                TextField(
                  key: const Key('admin_cliente_cuit'),
                  controller: _cuit,
                  decoration: const InputDecoration(labelText: 'CUIT o DNI'),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('admin_cliente_direccion'),
                  controller: _direccion,
                  decoration: const InputDecoration(labelText: 'Dirección'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: const Key('admin_cliente_condicion_iva'),
                  initialValue: _condicionIva,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Condición frente al IVA',
                  ),
                  items: _condicionesIva.entries
                      .map(
                        (entry) => DropdownMenuItem(
                          value: entry.key,
                          child: Text(entry.value),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setState(() => _condicionIva = value);
                  },
                ),
                const SizedBox(height: 12),
              ],
              const SizedBox(height: 12),
              SwitchListTile(
                key: const Key('admin_cliente_cuenta'),
                title: const Text('Habilitar cuenta corriente'),
                subtitle: const Text('Permite compras a crédito.'),
                value: _cuentaCorriente,
                onChanged: (v) => setState(() => _cuentaCorriente = v),
              ),
              if (widget.existente != null)
                SwitchListTile(
                  key: const Key('admin_cliente_activo'),
                  title: const Text('Activo'),
                  value: _activo,
                  onChanged: (v) => setState(() => _activo = v),
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
          onPressed: estado.enviando ? null : _guardar,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(widget.existente == null ? 'Crear' : 'Guardar'),
        ),
      ],
    );
  }
}
