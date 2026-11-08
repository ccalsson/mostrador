import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/cliente.dart';
import '../../services/clientes_service.dart';
import 'cliente_form_controller.dart';

const _condicionesIva = {
  'ri': 'IVA responsable inscripto',
  'monotributo': 'Responsable monotributo',
  'exento': 'IVA sujeto exento',
  'consumidor_final': 'Consumidor final',
};

/// A partir de este ancho la ficha queda al lado de la lista, como en la web
/// (`lg:grid-cols-[minmax(0,36rem)_22rem]`). En pantallas angostas se abre
/// en un diálogo.
const _quiebreFicha = 1024.0;

class ClientesPane extends ConsumerStatefulWidget {
  const ClientesPane({super.key});

  @override
  ConsumerState<ClientesPane> createState() => _ClientesPaneState();
}

class _ClientesPaneState extends ConsumerState<ClientesPane> {
  Cliente? _seleccionado;
  bool _modoNuevo = false;

  final _nombre = TextEditingController();
  final _telefono = TextEditingController();
  final _cuit = TextEditingController();
  final _direccion = TextEditingController();
  bool _cuentaCorriente = false;
  bool _activo = true;
  String _condicionIva = 'consumidor_final';
  String? _validacion;

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    _cuit.dispose();
    _direccion.dispose();
    super.dispose();
  }

  void _seleccionar(Cliente cliente, {required bool enRail}) {
    setState(() {
      _seleccionado = cliente;
      _modoNuevo = false;
      _cargarForm(cliente);
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
      _validacion = null;
    });
  }

  Future<void> _abrirFicha() async {
    await showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
          child: _TarjetaFicha(child: _ficha(dialogo)),
        ),
      ),
    );
  }

  Widget _ficha(BuildContext dialogo) {
    final estado = ref.watch(clienteFormProvider);
    return _Ficha(
      nombreController: _nombre,
      telefonoController: _telefono,
      cuitController: _cuit,
      direccionController: _direccion,
      cuentaCorriente: _cuentaCorriente,
      activo: _activo,
      condicionIva: _condicionIva,
      onCuentaCorrienteChanged: (v) => setState(() => _cuentaCorriente = v),
      onActivoChanged: (v) => setState(() => _activo = v),
      onCondicionIvaChanged: (v) => setState(() => _condicionIva = v),
      modoNuevo: _modoNuevo,
      cliente: _seleccionado,
      enviando: estado.enviando,
      errorMensaje: _validacion ?? estado.errorMensaje,
      onGuardar: () async {
        final ok = await _guardar();
        if (ok && dialogo.mounted) Navigator.of(dialogo).pop();
      },
      onCerrar: () {
        if (dialogo.mounted) Navigator.of(dialogo).pop();
        _cerrarFicha();
      },
      onCambiarActivo: _seleccionado == null
          ? null
          : () async {
              final ok = await _cambiarActivo(_seleccionado!);
              if (ok && dialogo.mounted) Navigator.of(dialogo).pop();
            },
      onVerCuenta: _seleccionado?.cuentaCorriente == true
          ? () => _mostrarCuenta(_seleccionado!)
          : null,
    );
  }

  void _cargarForm(Cliente cliente) {
    _nombre.text = cliente.nombre;
    _telefono.text = cliente.telefono ?? '';
    _cuit.text = cliente.cuit ?? '';
    _direccion.text = cliente.direccion ?? '';
    _cuentaCorriente = cliente.cuentaCorriente;
    _activo = cliente.activo;
    _condicionIva = _condicionesIva.containsKey(cliente.condicionIva)
        ? cliente.condicionIva
        : 'consumidor_final';
    _validacion = null;
  }

  void _limpiarForm() {
    _nombre.clear();
    _telefono.clear();
    _cuit.clear();
    _direccion.clear();
    _cuentaCorriente = false;
    _activo = true;
    _condicionIva = 'consumidor_final';
    _validacion = null;
  }

  /// Devuelve true si el backend aceptó el guardado.
  Future<bool> _guardar() async {
    final nombre = _nombre.text.trim();
    final telefono = _telefono.text.trim();
    if (nombre.isEmpty) {
      setState(() => _validacion = 'Ingresá el nombre del cliente.');
      return false;
    }
    setState(() => _validacion = null);

    final controller = ref.read(clienteFormProvider.notifier);
    final ok = _modoNuevo
        ? await controller.crear(
            ClienteInput(
              nombre: nombre,
              telefono: telefono.isNotEmpty ? telefono : null,
              cuentaCorriente: _cuentaCorriente,
            ),
          )
        : await controller.actualizar(
            _seleccionado!.id,
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

    if (!ok || !mounted) return false;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_modoNuevo ? 'Cliente cargado.' : 'Cliente guardado.'),
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

  /// Baja lógica (o reactivación) desde la lista o la ficha, como en la web.
  Future<bool> _cambiarActivo(Cliente cliente) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogo) => AlertDialog(
        title: Text(cliente.activo ? 'Eliminar cliente' : 'Reactivar cliente'),
        content: Text(
          cliente.activo
              ? '¿Eliminar a ${cliente.nombre}? Deja de usarse en el puesto. '
                    'Pedidos y saldo quedan.'
              : '¿Reactivar a ${cliente.nombre}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogo).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('admin_cliente_confirmar_baja'),
            onPressed: () => Navigator.of(dialogo).pop(true),
            child: Text(cliente.activo ? 'Eliminar' : 'Reactivar'),
          ),
        ],
      ),
    );
    if (confirmar != true) return false;

    final ok = await ref
        .read(clienteFormProvider.notifier)
        .actualizar(
          cliente.id,
          ClienteActualizacionInput(
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            cuit: cliente.cuit,
            direccion: cliente.direccion,
            cuentaCorriente: cliente.cuentaCorriente,
            condicionIva: cliente.condicionIva,
            activo: !cliente.activo,
          ),
        );
    if (!ok || !mounted) return false;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          cliente.activo
              ? 'Cliente eliminado. El historial queda.'
              : 'Cliente reactivado.',
        ),
      ),
    );
    if (_seleccionado?.id == cliente.id) _cerrarFicha();
    return true;
  }

  void _mostrarCuenta(Cliente cliente) {
    showDialog<void>(
      context: context,
      builder: (_) => _CuentaCorrienteDialog(cliente: cliente),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final clientes = ref.watch(clientesProvider);
    final estado = ref.watch(clienteFormProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Eliminar da de baja al cliente. No borra pedidos ni el '
                    'saldo de cuenta corriente.',
                    style: TextStyle(fontSize: 12.5, color: tokens.muted),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  key: const Key('admin_nuevo_cliente'),
                  onPressed: () => _nuevo(enRail: enRail),
                  icon: const Icon(Icons.person_add_outlined, size: 18),
                  label: const Text('Nuevo cliente'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: clientes.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Error al cargar clientes.',
                        style: TextStyle(fontSize: 13, color: tokens.terra),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        key: const Key('admin_clientes_reintentar'),
                        onPressed: () => ref.invalidate(clientesProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (lista) {
                  final elegido = lista
                      .where((c) => c.id == _seleccionado?.id)
                      .firstOrNull;
                  final listado = _Listado(
                    clientes: lista,
                    seleccion: _seleccionado?.id,
                    onElegir: (c) => _seleccionar(c, enRail: enRail),
                    onCambiarActivo: _cambiarActivo,
                    onVerCuenta: _mostrarCuenta,
                    ocupado: estado.enviando,
                  );

                  if (!enRail) return listado;

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: listado),
                      const SizedBox(width: 16),
                      SizedBox(
                        width: 340,
                        child: elegido == null && !_modoNuevo
                            ? Text(
                                'Elegí un cliente para editar su ficha.',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: tokens.muted,
                                ),
                              )
                            : _TarjetaFicha(child: _ficha(context)),
                      ),
                    ],
                  );
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
    required this.clientes,
    required this.seleccion,
    required this.onElegir,
    required this.onCambiarActivo,
    required this.onVerCuenta,
    required this.ocupado,
  });

  final List<Cliente> clientes;
  final String? seleccion;
  final void Function(Cliente) onElegir;
  final Future<bool> Function(Cliente) onCambiarActivo;
  final void Function(Cliente) onVerCuenta;
  final bool ocupado;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    if (clientes.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'Todavía no hay clientes.',
            key: const Key('admin_clientes_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }

    return Tarjeta(
      padding: EdgeInsets.zero,
      child: ListView.separated(
        key: const Key('admin_clientes_lista'),
        padding: EdgeInsets.zero,
        itemCount: clientes.length,
        separatorBuilder: (_, _) =>
            Divider(height: 1, thickness: 1, color: tokens.line),
        itemBuilder: (context, index) {
          final cliente = clientes[index];
          return _FilaCliente(
            key: Key('admin_cliente_${cliente.id}'),
            cliente: cliente,
            seleccionado: seleccion == cliente.id,
            ocupado: ocupado,
            onTap: () => onElegir(cliente),
            onVerCuenta: cliente.cuentaCorriente
                ? () => onVerCuenta(cliente)
                : null,
            onCambiarActivo: () => onCambiarActivo(cliente),
          );
        },
      ),
    );
  }
}

class _FilaCliente extends StatefulWidget {
  const _FilaCliente({
    super.key,
    required this.cliente,
    required this.seleccionado,
    required this.ocupado,
    required this.onTap,
    required this.onVerCuenta,
    required this.onCambiarActivo,
  });

  final Cliente cliente;
  final bool seleccionado;
  final bool ocupado;
  final VoidCallback onTap;
  final VoidCallback? onVerCuenta;
  final VoidCallback onCambiarActivo;

  @override
  State<_FilaCliente> createState() => _FilaClienteState();
}

class _FilaClienteState extends State<_FilaCliente> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final cliente = widget.cliente;
    final contacto = cliente.telefono?.isNotEmpty == true
        ? cliente.telefono!
        : (cliente.cuit?.isNotEmpty == true ? cliente.cuit! : 'Sin teléfono');
    final detalle =
        contacto +
        (cliente.cuentaCorriente ? ' · saldo ${moneda(cliente.saldo)}' : '');

    final fondo = widget.seleccionado
        ? tokens.okBg
        : (_encima ? tokens.paper : null);

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(
        onTap: widget.onTap,
        child: Container(
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
                      cliente.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: tokens.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detalle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: tokens.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Pildora(
                cliente.activo ? 'Activo' : 'Baja',
                color: cliente.activo ? tokens.ok : tokens.muted,
              ),
              if (cliente.userId != null) ...[
                const SizedBox(width: 6),
                Pildora('App', color: tokens.muted),
              ],
              if (widget.onVerCuenta != null)
                IconButton(
                  tooltip: 'Ver cuenta',
                  icon: const Icon(Icons.account_balance_wallet_outlined),
                  iconSize: 16,
                  color: tokens.inkSoft,
                  visualDensity: VisualDensity.compact,
                  style: IconButton.styleFrom(
                    minimumSize: const Size(30, 30),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: widget.onVerCuenta,
                ),
              const SizedBox(width: 6),
              _BotonFila(
                etiqueta: cliente.activo ? 'Eliminar' : 'Reactivar',
                color: cliente.activo ? tokens.terra : tokens.inkSoft,
                onPressed: widget.ocupado ? null : widget.onCambiarActivo,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BotonFila extends StatelessWidget {
  const _BotonFila({
    required this.etiqueta,
    required this.color,
    required this.onPressed,
  });

  final String etiqueta;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 30),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        side: BorderSide(color: tokens.line),
        foregroundColor: color,
        textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
      ),
      child: Text(etiqueta),
    );
  }
}

/// Borde superior naranja y cuerpo liso: la ficha de la web
/// (`rounded-lg border border-line border-t-2 border-t-naranja bg-surface`).
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
    required this.telefonoController,
    required this.cuitController,
    required this.direccionController,
    required this.cuentaCorriente,
    required this.activo,
    required this.condicionIva,
    required this.onCuentaCorrienteChanged,
    required this.onActivoChanged,
    required this.onCondicionIvaChanged,
    required this.modoNuevo,
    required this.cliente,
    required this.enviando,
    required this.errorMensaje,
    required this.onGuardar,
    required this.onCerrar,
    required this.onCambiarActivo,
    required this.onVerCuenta,
  });

  final TextEditingController nombreController;
  final TextEditingController telefonoController;
  final TextEditingController cuitController;
  final TextEditingController direccionController;
  final bool cuentaCorriente;
  final bool activo;
  final String condicionIva;
  final ValueChanged<bool> onCuentaCorrienteChanged;
  final ValueChanged<bool> onActivoChanged;
  final ValueChanged<String> onCondicionIvaChanged;
  final bool modoNuevo;
  final Cliente? cliente;
  final bool enviando;
  final String? errorMensaje;
  final FutureOr<void> Function() onGuardar;
  final VoidCallback onCerrar;
  final FutureOr<void> Function()? onCambiarActivo;
  final VoidCallback? onVerCuenta;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final saldo = cliente?.saldo ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  modoNuevo ? 'Nuevo cliente' : 'Ficha',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: enviando ? null : onCerrar,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.muted,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                child: const Text('Cerrar'),
              ),
            ],
          ),
          if (cliente?.email != null)
            Text(
              'Cuenta del portal: ${cliente!.email}',
              style: TextStyle(fontSize: 11.5, color: tokens.muted),
            ),
          const SizedBox(height: 4),
          Text(
            cuentaCorriente
                ? 'Saldo ${moneda(saldo)}'
                : 'Saldo ${moneda(saldo)} · sin cuenta corriente',
            style: TextStyle(fontSize: 12.5, color: tokens.muted),
          ),
          const SizedBox(height: 10),
          _campo(
            key: const Key('admin_cliente_nombre'),
            controller: nombreController,
            label: 'Nombre',
            requerido: true,
            capitalization: TextCapitalization.words,
          ),
          _campo(
            key: const Key('admin_cliente_telefono'),
            controller: telefonoController,
            label: 'Teléfono',
            keyboardType: TextInputType.phone,
          ),
          if (!modoNuevo) ...[
            _campo(
              key: const Key('admin_cliente_cuit'),
              controller: cuitController,
              label: 'CUIT',
            ),
            _campo(
              key: const Key('admin_cliente_direccion'),
              controller: direccionController,
              label: 'Dirección',
            ),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              key: const Key('admin_cliente_condicion_iva'),
              initialValue: condicionIva,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Condición frente al IVA',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              items: _condicionesIva.entries
                  .map(
                    (entry) => DropdownMenuItem(
                      value: entry.key,
                      child: Text(
                        entry.value,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                  )
                  .toList(),
              onChanged: enviando
                  ? null
                  : (value) {
                      if (value != null) onCondicionIvaChanged(value);
                    },
            ),
          ],
          const SizedBox(height: 4),
          _check(
            key: const Key('admin_cliente_cuenta'),
            valor: cuentaCorriente,
            etiqueta: 'Cuenta corriente',
            onChanged: enviando ? null : onCuentaCorrienteChanged,
          ),
          if (!modoNuevo)
            _check(
              key: const Key('admin_cliente_activo'),
              valor: activo,
              etiqueta: 'Activo en el puesto',
              onChanged: enviando ? null : onActivoChanged,
            ),
          if (onVerCuenta != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onVerCuenta,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 30),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.inkSoft,
                  textStyle: const TextStyle(fontSize: 12.5),
                ),
                icon: const Icon(
                  Icons.account_balance_wallet_outlined,
                  size: 16,
                ),
                label: const Text('Ver cuenta corriente'),
              ),
            ),
          if (errorMensaje != null) ...[
            const SizedBox(height: 6),
            Text(
              errorMensaje!,
              style: TextStyle(fontSize: 12.5, color: tokens.terra),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('admin_cliente_guardar'),
            onPressed: enviando ? null : () => onGuardar(),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(38),
              textStyle: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: enviando
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(modoNuevo ? 'Crear cliente' : 'Guardar ficha'),
          ),
          if (onCambiarActivo != null) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: enviando ? null : () => onCambiarActivo!(),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(38),
                side: BorderSide(color: tokens.line),
                foregroundColor: cliente?.activo == true
                    ? tokens.terra
                    : tokens.inkSoft,
                textStyle: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
              child: Text(
                cliente?.activo == true
                    ? 'Eliminar cliente'
                    : 'Reactivar cliente',
              ),
            ),
          ],
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
    TextCapitalization capitalization = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: controller,
        keyboardType: keyboardType,
        textCapitalization: capitalization,
        enabled: !enviando,
        style: const TextStyle(fontSize: 13),
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  Widget _check({
    required Key key,
    required bool valor,
    required String etiqueta,
    required ValueChanged<bool>? onChanged,
  }) {
    return Row(
      key: key,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Checkbox(
            value: valor,
            onChanged: onChanged == null ? null : (v) => onChanged(v ?? false),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            visualDensity: VisualDensity.compact,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(etiqueta, style: const TextStyle(fontSize: 13))),
      ],
    );
  }
}

class _CuentaCorrienteDialog extends ConsumerWidget {
  const _CuentaCorrienteDialog({required this.cliente});

  final Cliente cliente;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final cuenta = ref.watch(cuentaCorrienteProvider(cliente.id));

    return AlertDialog(
      title: Text('Cuenta de ${cliente.nombre}'),
      content: SizedBox(
        width: 600,
        height: 400,
        child: cuenta.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) =>
              const Center(child: Text('No se pudo cargar la cuenta.')),
          data: (data) => Column(
            children: [
              Tarjeta(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final etiqueta = Text(
                      'Saldo actual',
                      style: TextStyle(fontSize: 13, color: tokens.muted),
                    );
                    final saldo = Text(
                      moneda(data.saldo),
                      style: TablaWeb.numeros.copyWith(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: data.saldo < 0 ? tokens.terra : tokens.ok,
                      ),
                    );
                    if (constraints.maxWidth < 420) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [etiqueta, saldo],
                      );
                    }
                    return Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [etiqueta, saldo],
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: ListView.separated(
                  padding: EdgeInsets.zero,
                  itemCount: data.movimientos.length,
                  separatorBuilder: (_, _) =>
                      Divider(height: 1, thickness: 1, color: tokens.line),
                  itemBuilder: (context, index) {
                    final mov = data.movimientos[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  mov.tipo.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: tokens.inkSoft,
                                  ),
                                ),
                                Text(
                                  '${fechaCorta(mov.createdAt)}'
                                  '${mov.nota == null ? '' : ' · ${mov.nota}'}',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    color: tokens.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            moneda(mov.monto),
                            style: TablaWeb.numeros.copyWith(
                              fontWeight: FontWeight.w600,
                              color: mov.monto < 0 ? tokens.terra : tokens.ok,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        if (cliente.cuentaCorriente)
          FilledButton.tonal(
            key: const Key('admin_cliente_registrar_pago'),
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => _PagoCuentaDialog(cliente: cliente),
            ),
            child: const Text('Registrar pago'),
          ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }
}

class _PagoCuentaDialog extends ConsumerStatefulWidget {
  const _PagoCuentaDialog({required this.cliente});

  final Cliente cliente;

  @override
  ConsumerState<_PagoCuentaDialog> createState() => _PagoCuentaDialogState();
}

class _PagoCuentaDialogState extends ConsumerState<_PagoCuentaDialog> {
  late final TextEditingController _monto;
  late final TextEditingController _nota;
  bool _enviando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _monto = TextEditingController();
    _nota = TextEditingController();
  }

  @override
  void dispose() {
    _monto.dispose();
    _nota.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    final monto = parseDecimal(_monto.text);
    if (monto == null || monto <= 0) {
      return setState(() => _error = 'Ingresá un monto mayor a cero.');
    }
    if (_nota.text.trim().length > 200) {
      return setState(() => _error = 'La nota admite hasta 200 caracteres.');
    }
    setState(() {
      _error = null;
      _enviando = true;
    });
    try {
      await ref
          .read(clientesServiceProvider)
          .registrarPago(
            widget.cliente.id,
            monto: monto,
            nota: _nota.text.trim().isEmpty ? null : _nota.text.trim(),
          );
      if (!mounted) return;
      ref.invalidate(cuentaCorrienteProvider(widget.cliente.id));
      ref.invalidate(clientesProvider);
      Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _enviando = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudo registrar el pago.';
        _enviando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return AlertDialog(
      title: Text('Pago de ${widget.cliente.nombre}'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const Key('admin_cliente_pago_monto'),
              controller: _monto,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Monto',
                prefixText: '\$ ',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_cliente_pago_nota'),
              controller: _nota,
              maxLength: 200,
              decoration: const InputDecoration(
                labelText: 'Nota (opcional)',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(fontSize: 12.5, color: tokens.terra),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _enviando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_cliente_pago_guardar'),
          onPressed: _enviando ? null : _registrar,
          child: _enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Registrar pago'),
        ),
      ],
    );
  }
}
