import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/proveedor.dart';
import '../../services/proveedores_service.dart';
import 'proveedor_form_controller.dart';

class ProveedoresPane extends ConsumerStatefulWidget {
  const ProveedoresPane({super.key});

  @override
  ConsumerState<ProveedoresPane> createState() => _ProveedoresPaneState();
}

class _ProveedoresPaneState extends ConsumerState<ProveedoresPane> {
  Proveedor? _seleccionado;
  bool _modoNuevo = false;

  final _nombre = TextEditingController();
  final _cuit = TextEditingController();
  final _telefono = TextEditingController();
  final _email = TextEditingController();
  final _direccion = TextEditingController();
  final _observaciones = TextEditingController();
  bool _activo = true;
  String? _validacion;

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

  void _seleccionar(Proveedor proveedor) {
    setState(() {
      _seleccionado = proveedor;
      _modoNuevo = false;
      _cargarForm(proveedor);
    });
  }

  void _nuevo() {
    setState(() {
      _seleccionado = null;
      _modoNuevo = true;
      _limpiarForm();
    });
  }

  void _cargarForm(Proveedor proveedor) {
    _nombre.text = proveedor.nombre;
    _cuit.text = proveedor.cuit ?? '';
    _telefono.text = proveedor.telefono ?? '';
    _email.text = proveedor.email ?? '';
    _direccion.text = proveedor.direccion ?? '';
    _observaciones.text = proveedor.observaciones ?? '';
    _activo = proveedor.activo;
    _validacion = null;
  }

  void _limpiarForm() {
    _nombre.clear();
    _cuit.clear();
    _telefono.clear();
    _email.clear();
    _direccion.clear();
    _observaciones.clear();
    _activo = true;
    _validacion = null;
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre del proveedor.');
    }
    setState(() => _validacion = null);
    final ok = await ref.read(proveedorFormProvider.notifier).guardar(
      id: _seleccionado?.id,
      input: ProveedorInput(
        nombre: nombre,
        cuit: _cuit.text.trim().isEmpty ? null : _cuit.text.trim(),
        telefono: _telefono.text.trim().isEmpty ? null : _telefono.text.trim(),
        email: _email.text.trim().isEmpty ? null : _email.text.trim(),
        direccion: _direccion.text.trim().isEmpty ? null : _direccion.text.trim(),
        observaciones: _observaciones.text.trim().isEmpty
            ? null
            : _observaciones.text.trim(),
        activo: _activo,
      ),
    );
    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_modoNuevo ? 'Proveedor cargado.' : 'Proveedor guardado.'),
      ),
    );
    ref.invalidate(proveedoresProvider);
    if (_modoNuevo) {
      setState(() {
        _modoNuevo = false;
        _seleccionado = null;
        _limpiarForm();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final proveedores = ref.watch(proveedoresProvider);
    final estado = ref.watch(proveedorFormProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Proveedores',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                key: const Key('admin_proveedores_refrescar'),
                tooltip: 'Actualizar proveedores',
                onPressed: () => ref.invalidate(proveedoresProvider),
                icon: const Icon(Icons.refresh),
              ),
              FilledButton.icon(
                key: const Key('admin_nuevo_proveedor'),
                onPressed: _nuevo,
                icon: const Icon(Icons.add),
                label: const Text('Nuevo proveedor'),
              ),
            ],
          ),
        ),
        Expanded(
          child: proveedores.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    error is ApiException
                        ? error.message
                        : 'No se pudieron cargar los proveedores.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(proveedoresProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) => Row(
              children: [
                Expanded(
                  flex: 2,
                  child: lista.isEmpty
                      ? const Center(
                          child: Text(
                            'Todavía no hay proveedores.',
                            key: Key('admin_proveedores_vacia'),
                          ),
                        )
                      : ListView.separated(
                          key: const Key('admin_proveedores_lista'),
                          itemCount: lista.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final proveedor = lista[index];
                            final seleccionado = _seleccionado?.id == proveedor.id;
                            return _ProveedorTile(
                              proveedor: proveedor,
                              seleccionado: seleccionado,
                              onTap: () => _seleccionar(proveedor),
                            );
                          },
                        ),
                ),
                if (_seleccionado != null || _modoNuevo)
                  Expanded(
                    flex: 3,
                    child: Material(
                      color: Theme.of(context).colorScheme.surfaceContainerLowest,
                      child: Container(
                        decoration: BoxDecoration(
                          border: Border(
                            left: BorderSide(
                              color: Theme.of(context).dividerColor,
                            ),
                          ),
                        ),
                        child: _FormPanel(
                          nombreController: _nombre,
                          cuitController: _cuit,
                          telefonoController: _telefono,
                          emailController: _email,
                          direccionController: _direccion,
                          observacionesController: _observaciones,
                          activo: _activo,
                          onActivoChanged: (v) => setState(() => _activo = v),
                          modoNuevo: _modoNuevo,
                          validacion: _validacion,
                          enviando: estado.enviando,
                          errorMensaje: _validacion ?? estado.errorMensaje,
                          onGuardar: _guardar,
                          proveedorId: _seleccionado?.id,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ProveedorTile extends StatelessWidget {
  const _ProveedorTile({
    required this.proveedor,
    required this.seleccionado,
    required this.onTap,
  });

  final Proveedor proveedor;
  final bool seleccionado;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final datos = proveedor.cuit != null && proveedor.cuit!.isNotEmpty
        ? proveedor.cuit!
        : proveedor.telefono != null && proveedor.telefono!.isNotEmpty
        ? proveedor.telefono!
        : 'Sin datos';

    return ListTile(
      key: Key('admin_proveedor_${proveedor.id}'),
      tileColor: seleccionado
          ? Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      leading: const Icon(Icons.local_shipping_outlined),
      title: Text(
        proveedor.nombre,
        style: TextStyle(fontWeight: seleccionado ? FontWeight.w600 : null),
      ),
      subtitle: Text(datos),
      trailing: Chip(
        label: Text(proveedor.activo ? 'Activo' : 'Baja'),
        visualDensity: VisualDensity.compact,
        backgroundColor: proveedor.activo
            ? Theme.of(context).colorScheme.primaryContainer
            : Theme.of(context).colorScheme.errorContainer,
      ),
      onTap: onTap,
    );
  }
}

class _FormPanel extends StatelessWidget {
  const _FormPanel({
    required this.nombreController,
    required this.cuitController,
    required this.telefonoController,
    required this.emailController,
    required this.direccionController,
    required this.observacionesController,
    required this.activo,
    required this.onActivoChanged,
    required this.modoNuevo,
    required this.validacion,
    required this.enviando,
    required this.errorMensaje,
    required this.onGuardar,
    required this.proveedorId,
  });

  final TextEditingController nombreController;
  final TextEditingController cuitController;
  final TextEditingController telefonoController;
  final TextEditingController emailController;
  final TextEditingController direccionController;
  final TextEditingController observacionesController;
  final bool activo;
  final ValueChanged<bool> onActivoChanged;
  final bool modoNuevo;
  final String? validacion;
  final bool enviando;
  final String? errorMensaje;
  final VoidCallback onGuardar;
  final String? proveedorId;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            modoNuevo ? 'Nuevo proveedor' : 'Proveedor',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          _campo(
            key: const Key('admin_proveedor_nombre'),
            controller: nombreController,
            label: 'Nombre',
            maxLength: 120,
            requerido: true,
          ),
          _campo(
            key: const Key('admin_proveedor_cuit'),
            controller: cuitController,
            label: 'CUIT',
            maxLength: 20,
          ),
          _campo(
            key: const Key('admin_proveedor_telefono'),
            controller: telefonoController,
            label: 'Teléfono',
            maxLength: 40,
            keyboardType: TextInputType.phone,
          ),
          _campo(
            key: const Key('admin_proveedor_email'),
            controller: emailController,
            label: 'Email',
            maxLength: 120,
            keyboardType: TextInputType.emailAddress,
          ),
          _campo(
            key: const Key('admin_proveedor_direccion'),
            controller: direccionController,
            label: 'Dirección',
            maxLength: 200,
          ),
          _campo(
            key: const Key('admin_proveedor_observaciones'),
            controller: observacionesController,
            label: 'Observaciones',
            maxLength: 300,
          ),
          if (!modoNuevo)
            SwitchListTile(
              key: const Key('admin_proveedor_activo'),
              title: const Text('Activo'),
              value: activo,
              onChanged: enviando ? null : onActivoChanged,
            ),
          if (proveedorId != null)
            _ProductosProveedor(proveedorId: proveedorId!),
          if (errorMensaje != null) ...[
            const SizedBox(height: 8),
            Text(
              errorMensaje!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('admin_proveedor_guardar'),
            onPressed: enviando ? null : onGuardar,
            child: enviando
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Guardar'),
          ),
        ],
      ),
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
        enabled: !enviando,
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
        ),
      ),
    );
  }
}

class _ProductosProveedor extends ConsumerWidget {
  const _ProductosProveedor({required this.proveedorId});

  final String proveedorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productos = ref.watch(productosProveedorProvider(proveedorId));
    return productos.when(
      loading: () => const LinearProgressIndicator(),
      error: (error, _) => Text(
        error is ApiException
            ? error.message
            : 'No se pudieron cargar los productos.',
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
      data: (nombres) {
        if (nombres.isEmpty) {
          return const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text('Todavía no hay remitos confirmados de este proveedor.'),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Productos en sus remitos',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              for (final nombre in nombres)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(nombre),
                ),
            ],
          ),
        );
      },
    );
  }
}
