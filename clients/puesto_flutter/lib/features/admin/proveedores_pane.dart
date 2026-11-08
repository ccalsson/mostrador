import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/proveedor.dart';
import '../../services/proveedores_service.dart';
import 'proveedor_form_controller.dart';

const _quiebreFicha = 1024.0;

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

  void _seleccionar(Proveedor proveedor, {required bool enRail}) {
    setState(() {
      _seleccionado = proveedor;
      _modoNuevo = false;
      _cargarForm(proveedor);
    });
    if (!enRail) _abrirFicha();
  }

  void _nuevo({required bool enRail}) {
    setState(() {
      _seleccionado = null;
      _modoNuevo = true;
      _limpiarForm();
    });
    if (!enRail) _abrirFicha();
  }

  void _cerrarFicha() {
    setState(() {
      _seleccionado = null;
      _modoNuevo = false;
      _limpiarForm();
    });
  }

  void _abrirFicha() {
    showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
          child: _TarjetaFicha(
            child: _Ficha(
              nombreController: _nombre,
              cuitController: _cuit,
              telefonoController: _telefono,
              emailController: _email,
              direccionController: _direccion,
              observacionesController: _observaciones,
              activo: _activo,
              onActivoChanged: (v) => setState(() => _activo = v),
              modoNuevo: _modoNuevo,
              proveedor: _seleccionado,
              enviando: ref.read(proveedorFormProvider).enviando,
              errorMensaje:
                  _validacion ?? ref.read(proveedorFormProvider).errorMensaje,
              onGuardar: () async {
                final ok = await _guardar();
                if (ok && dialogo.mounted) Navigator.of(dialogo).pop();
              },
              onCerrar: () => Navigator.of(dialogo).pop(),
            ),
          ),
        ),
      ),
    );
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

  Future<bool> _guardar() async {
    final nombre = _nombre.text.trim();
    if (nombre.isEmpty) {
      setState(() => _validacion = 'Ingresá el nombre del proveedor.');
      return false;
    }
    setState(() => _validacion = null);
    final ok = await ref.read(proveedorFormProvider.notifier).guardar(
      id: _seleccionado?.id,
      input: ProveedorInput(
        nombre: nombre,
        cuit: _cuit.text.trim().isEmpty ? null : _cuit.text.trim(),
        telefono:
            _telefono.text.trim().isEmpty ? null : _telefono.text.trim(),
        email: _email.text.trim().isEmpty ? null : _email.text.trim(),
        direccion:
            _direccion.text.trim().isEmpty ? null : _direccion.text.trim(),
        observaciones: _observaciones.text.trim().isEmpty
            ? null
            : _observaciones.text.trim(),
        activo: _activo,
      ),
    );
    if (!ok || !mounted) return false;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _modoNuevo ? 'Proveedor cargado.' : 'Proveedor guardado.',
        ),
      ),
    );
    if (_modoNuevo) {
      setState(() {
        _modoNuevo = false;
        _seleccionado = null;
        _limpiarForm();
      });
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final proveedores = ref.watch(proveedoresProvider);
    final estado = ref.watch(proveedorFormProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;
        final elegido = _seleccionado;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Directorio del puesto. Se elige al cargar un remito.',
                      style: TextStyle(fontSize: 12.5, color: tokens.muted),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    key: const Key('admin_nuevo_proveedor'),
                    onPressed: () => _nuevo(enRail: enRail),
                    icon: const Icon(Icons.person_add_outlined, size: 18),
                    label: const Text('Nuevo proveedor'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: proveedores.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
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
                        key: const Key('admin_proveedores_reintentar'),
                        onPressed: () =>
                            ref.invalidate(proveedoresProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (lista) {
                  final listado = _Listado(
                    lista: lista,
                    seleccionado: elegido,
                    onTap: (p) => _seleccionar(p, enRail: enRail),
                  );
                  if (enRail) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: listado),
                        const SizedBox(width: 16),
                        SizedBox(
                          width: 340,
                          child: elegido == null && !_modoNuevo
                              ? Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Text(
                                    'Elegí un proveedor para editar su ficha.',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color: tokens.muted,
                                    ),
                                  ),
                                )
                              : _TarjetaFicha(
                                  child: _Ficha(
                                    nombreController: _nombre,
                                    cuitController: _cuit,
                                    telefonoController: _telefono,
                                    emailController: _email,
                                    direccionController: _direccion,
                                    observacionesController: _observaciones,
                                    activo: _activo,
                                    onActivoChanged: (v) =>
                                        setState(() => _activo = v),
                                    modoNuevo: _modoNuevo,
                                    proveedor: elegido,
                                    enviando: estado.enviando,
                                    errorMensaje:
                                        _validacion ?? estado.errorMensaje,
                                    onGuardar: _guardar,
                                    onCerrar: _cerrarFicha,
                                  ),
                                ),
                        ),
                      ],
                    );
                  }
                  return listado;
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Listado extends StatelessWidget {
  const _Listado({
    required this.lista,
    required this.seleccionado,
    required this.onTap,
  });

  final List<Proveedor> lista;
  final Proveedor? seleccionado;
  final ValueChanged<Proveedor> onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    if (lista.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'Todavía no hay proveedores.',
            key: const Key('admin_proveedores_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }
    return Tarjeta(
      padding: EdgeInsets.zero,
      child: ListView.separated(
        key: const Key('admin_proveedores_lista'),
        padding: EdgeInsets.zero,
        itemCount: lista.length,
        separatorBuilder: (_, _) =>
            Divider(height: 1, thickness: 1, color: tokens.line),
        itemBuilder: (context, index) {
          final proveedor = lista[index];
          return _FilaProveedor(
            key: Key('admin_proveedor_${proveedor.id}'),
            proveedor: proveedor,
            seleccionado: seleccionado?.id == proveedor.id,
            onTap: () => onTap(proveedor),
          );
        },
      ),
    );
  }
}

class _FilaProveedor extends StatefulWidget {
  const _FilaProveedor({
    super.key,
    required this.proveedor,
    required this.seleccionado,
    required this.onTap,
  });

  final Proveedor proveedor;
  final bool seleccionado;
  final VoidCallback onTap;

  @override
  State<_FilaProveedor> createState() => _FilaProveedorState();
}

class _FilaProveedorState extends State<_FilaProveedor> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final datos = widget.proveedor.cuit != null &&
            widget.proveedor.cuit!.isNotEmpty
        ? widget.proveedor.cuit!
        : widget.proveedor.telefono != null &&
                widget.proveedor.telefono!.isNotEmpty
            ? widget.proveedor.telefono!
            : 'Sin datos';
    final fondo =
        widget.seleccionado ? tokens.okBg : (_encima ? tokens.paper : null);

    final contenido = Container(
      constraints: const BoxConstraints(minHeight: 44),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      color: fondo,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.proveedor.nombre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 2),
                Text(
                  datos,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11.5, color: tokens.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Pildora(
            widget.proveedor.activo ? 'Activo' : 'Baja',
            color: widget.proveedor.activo ? tokens.ok : tokens.muted,
          ),
        ],
      ),
    );

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(onTap: widget.onTap, child: contenido),
    );
  }
}

class _TarjetaFicha extends StatelessWidget {
  const _TarjetaFicha({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 2, color: tokens.naranja),
          Flexible(child: child),
        ],
      ),
    );
  }
}

class _Ficha extends StatelessWidget {
  const _Ficha({
    required this.nombreController,
    required this.cuitController,
    required this.telefonoController,
    required this.emailController,
    required this.direccionController,
    required this.observacionesController,
    required this.activo,
    required this.onActivoChanged,
    required this.modoNuevo,
    required this.proveedor,
    required this.enviando,
    required this.errorMensaje,
    required this.onGuardar,
    required this.onCerrar,
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
  final Proveedor? proveedor;
  final bool enviando;
  final String? errorMensaje;
  final FutureOr<void> Function() onGuardar;
  final VoidCallback onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                modoNuevo ? 'Alta' : 'Ficha',
                style: const TextStyle(
                  fontFamily: 'Fraunces',
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextButton(
                onPressed: onCerrar,
                child: const Text('Cerrar', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _campo(
            key: const Key('admin_proveedor_nombre'),
            controller: nombreController,
            label: 'Nombre',
            requerido: true,
          ),
          _campo(
            key: const Key('admin_proveedor_cuit'),
            controller: cuitController,
            label: 'CUIT',
          ),
          _campo(
            key: const Key('admin_proveedor_telefono'),
            controller: telefonoController,
            label: 'Teléfono',
            keyboardType: TextInputType.phone,
          ),
          _campo(
            key: const Key('admin_proveedor_email'),
            controller: emailController,
            label: 'Email',
            keyboardType: TextInputType.emailAddress,
          ),
          _campo(
            key: const Key('admin_proveedor_direccion'),
            controller: direccionController,
            label: 'Dirección',
          ),
          _campo(
            key: const Key('admin_proveedor_observaciones'),
            controller: observacionesController,
            label: 'Observaciones',
            maxLines: 3,
          ),
          if (!modoNuevo) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    key: const Key('admin_proveedor_activo'),
                    value: activo,
                    onChanged:
                        enviando ? null : (v) => onActivoChanged(v ?? false),
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'Activo en el puesto',
                  style: TextStyle(fontSize: 13),
                ),
              ],
            ),
          ],
          if (proveedor != null) ...[
            const SizedBox(height: 12),
            _ProductosProveedor(proveedorId: proveedor!.id),
          ],
          if (errorMensaje != null) ...[
            const SizedBox(height: 8),
            Text(
              errorMensaje!,
              style: TextStyle(fontSize: 12.5, color: tokens.terra),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('admin_proveedor_guardar'),
            onPressed: enviando ? null : onGuardar,
            style: ButtonStyle(
              minimumSize: WidgetStateProperty.all(const Size.fromHeight(38)),
            ),
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
    bool requerido = false,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        enabled: !enviando,
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
          border: const OutlineInputBorder(),
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
    final tokens = context.tokens;
    final productos = ref.watch(productosProveedorProvider(proveedorId));
    return productos.when(
      loading: () => const LinearProgressIndicator(),
      error: (error, _) => Text(
        error is ApiException
            ? error.message
            : 'No se pudieron cargar los productos.',
        style: TextStyle(fontSize: 12.5, color: tokens.terra),
      ),
      data: (nombres) {
        if (nombres.isEmpty) {
          return Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Todavía no hay remitos confirmados de este proveedor.',
              style: TextStyle(fontSize: 12.5, color: tokens.muted),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Productos en sus remitos',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              for (final nombre in nombres)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(nombre, style: const TextStyle(fontSize: 12.5)),
                ),
            ],
          ),
        );
      },
    );
  }
}
