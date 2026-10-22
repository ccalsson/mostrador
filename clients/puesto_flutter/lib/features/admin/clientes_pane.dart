import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/cliente.dart';
import '../../services/clientes_service.dart';
import 'cliente_form_controller.dart';

const _condicionesIva = {
  'ri': 'IVA responsable inscripto',
  'monotributo': 'Responsable monotributo',
  'exento': 'IVA sujeto exento',
  'consumidor_final': 'Consumidor final',
};

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

  void _seleccionar(Cliente cliente) {
    setState(() {
      _seleccionado = cliente;
      _modoNuevo = false;
      _cargarForm(cliente);
    });
  }

  void _nuevo() {
    setState(() {
      _seleccionado = null;
      _modoNuevo = true;
      _limpiarForm();
    });
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

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    final telefono = _telefono.text.trim();
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre del cliente.');
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

    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_modoNuevo ? 'Cliente cargado.' : 'Cliente guardado.'),
      ),
    );
    ref.invalidate(clientesProvider);
    if (_modoNuevo) {
      setState(() {
        _modoNuevo = false;
        _seleccionado = null;
        _limpiarForm();
      });
    }
  }

  void _mostrarCuenta(Cliente cliente) {
    showDialog<void>(
      context: context,
      builder: (_) => _CuentaCorrienteDialog(cliente: cliente),
    );
  }

  @override
  Widget build(BuildContext context) {
    final clientes = ref.watch(clientesProvider);
    final estado = ref.watch(clienteFormProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Clientes',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              FilledButton.icon(
                key: const Key('admin_nuevo_cliente'),
                onPressed: _nuevo,
                icon: const Icon(Icons.person_add_outlined),
                label: const Text('Nuevo cliente'),
              ),
            ],
          ),
        ),
        Expanded(
          child: clientes.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Error al cargar clientes.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(clientesProvider),
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
                            'No hay clientes.',
                            key: Key('clientes_vacia'),
                          ),
                        )
                      : ListView.separated(
                          key: const Key('admin_clientes_lista'),
                          itemCount: lista.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final cliente = lista[index];
                            final seleccionado = _seleccionado?.id == cliente.id;
                            return _ClienteTile(
                              cliente: cliente,
                              seleccionado: seleccionado,
                              onTap: () => _seleccionar(cliente),
                              onCuenta: () => _mostrarCuenta(cliente),
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
                          telefonoController: _telefono,
                          cuitController: _cuit,
                          direccionController: _direccion,
                          cuentaCorriente: _cuentaCorriente,
                          activo: _activo,
                          condicionIva: _condicionIva,
                          onCuentaCorrienteChanged: (v) =>
                              setState(() => _cuentaCorriente = v),
                          onActivoChanged: (v) => setState(() => _activo = v),
                          onCondicionIvaChanged: (v) =>
                              setState(() => _condicionIva = v),
                          modoNuevo: _modoNuevo,
                          enviando: estado.enviando,
                          errorMensaje: _validacion ?? estado.errorMensaje,
                          onGuardar: _guardar,
                          tieneCuentaCorriente: _seleccionado?.cuentaCorriente ?? false,
                          onVerCuenta: _seleccionado != null
                              ? () => _mostrarCuenta(_seleccionado!)
                              : null,
                          saldo: _seleccionado?.saldo ?? 0,
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

class _ClienteTile extends StatelessWidget {
  const _ClienteTile({
    required this.cliente,
    required this.seleccionado,
    required this.onTap,
    required this.onCuenta,
  });

  final Cliente cliente;
  final bool seleccionado;
  final VoidCallback onTap;
  final VoidCallback onCuenta;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('admin_cliente_${cliente.id}'),
      tileColor: seleccionado
          ? Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      leading: CircleAvatar(
        child: Text(
          cliente.nombre.isNotEmpty ? cliente.nombre[0].toUpperCase() : '?',
        ),
      ),
      title: Text(
        cliente.nombre,
        style: TextStyle(fontWeight: seleccionado ? FontWeight.w600 : null),
      ),
      subtitle: Text(cliente.telefono ?? 'Sin teléfono'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (cliente.cuentaCorriente)
            Chip(
              label: const Text('Cuenta Cte.'),
              visualDensity: VisualDensity.compact,
              backgroundColor: Theme.of(context).colorScheme.tertiaryContainer,
            ),
          if (!cliente.activo)
            Chip(
              label: const Text('Baja'),
              visualDensity: VisualDensity.compact,
              backgroundColor: Theme.of(context).colorScheme.errorContainer,
            ),
          IconButton(
            icon: const Icon(Icons.account_balance_wallet_outlined),
            tooltip: 'Ver cuenta',
            onPressed: cliente.cuentaCorriente ? onCuenta : null,
          ),
        ],
      ),
      onTap: onTap,
    );
  }
}

class _FormPanel extends StatelessWidget {
  const _FormPanel({
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
    required this.enviando,
    required this.errorMensaje,
    required this.onGuardar,
    required this.tieneCuentaCorriente,
    required this.onVerCuenta,
    required this.saldo,
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
  final bool enviando;
  final String? errorMensaje;
  final VoidCallback onGuardar;
  final bool tieneCuentaCorriente;
  final VoidCallback? onVerCuenta;
  final double saldo;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            modoNuevo ? 'Nuevo cliente' : 'Editar cliente',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          _campo(
            key: const Key('admin_cliente_nombre'),
            controller: nombreController,
            label: 'Nombre o Razón Social',
            requerido: true,
            capitalization: TextCapitalization.words,
          ),
          _campo(
            key: const Key('admin_cliente_telefono'),
            controller: telefonoController,
            label: 'Teléfono (opcional)',
            keyboardType: TextInputType.phone,
          ),
          if (!modoNuevo) ...[
            _campo(
              key: const Key('admin_cliente_cuit'),
              controller: cuitController,
              label: 'CUIT o DNI',
            ),
            _campo(
              key: const Key('admin_cliente_direccion'),
              controller: direccionController,
              label: 'Dirección',
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: const Key('admin_cliente_condicion_iva'),
              initialValue: condicionIva,
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
              onChanged: enviando
                  ? null
                  : (value) {
                      if (value != null) onCondicionIvaChanged(value);
                    },
            ),
          ],
          const SizedBox(height: 8),
          SwitchListTile(
            key: const Key('admin_cliente_cuenta'),
            title: const Text('Habilitar cuenta corriente'),
            subtitle: const Text('Permite compras a crédito.'),
            value: cuentaCorriente,
            onChanged: enviando ? null : onCuentaCorrienteChanged,
          ),
          if (!modoNuevo)
            SwitchListTile(
              key: const Key('admin_cliente_activo'),
              title: const Text('Activo'),
              value: activo,
              onChanged: enviando ? null : onActivoChanged,
            ),
          if (tieneCuentaCorriente && onVerCuenta != null) ...[
            const Divider(),
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Saldo actual', style: TextStyle(fontSize: 16)),
                    Text(
                      moneda(saldo),
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: saldo < 0 ? Colors.red : Colors.green,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onVerCuenta,
              icon: const Icon(Icons.account_balance_wallet),
              label: const Text('Ver cuenta corriente'),
            ),
          ],
          if (errorMensaje != null) ...[
            const SizedBox(height: 8),
            Text(
              errorMensaje!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('admin_cliente_guardar'),
            onPressed: enviando ? null : onGuardar,
            child: enviando
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(modoNuevo ? 'Crear' : 'Guardar'),
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
    TextCapitalization capitalization = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: controller,
        maxLength: requerido ? 120 : null,
        keyboardType: keyboardType,
        textCapitalization: capitalization,
        enabled: !enviando,
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
        ),
      ),
    );
  }
}

class _CuentaCorrienteDialog extends ConsumerWidget {
  const _CuentaCorrienteDialog({required this.cliente});

  final Cliente cliente;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cuenta = ref.watch(cuentaCorrienteProvider(cliente.id));

    return AlertDialog(
      title: Text('Cuenta de ${cliente.nombre}'),
      content: SizedBox(
        width: 600,
        height: 400,
        child: cuenta.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) =>
              Center(child: Text('No se pudo cargar la cuenta.')),
          data: (data) => Column(
            children: [
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final etiqueta = const Text(
                        'Saldo Actual',
                        style: TextStyle(fontSize: 18),
                      );
                      final saldo = Text(
                        moneda(data.saldo),
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: data.saldo < 0 ? Colors.red : Colors.green,
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
              ),
              const SizedBox(height: 16),
              Expanded(
                child: ListView.builder(
                  itemCount: data.movimientos.length,
                  itemBuilder: (context, index) {
                    final mov = data.movimientos[index];
                    return ListTile(
                      title: Text(mov.tipo.toUpperCase()),
                      subtitle: Text(
                        '${fechaCorta(mov.createdAt)} - ${mov.nota ?? ""}',
                      ),
                      trailing: Text(
                        moneda(mov.monto),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: mov.monto < 0 ? Colors.red : Colors.green,
                        ),
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
      await ref.read(clientesServiceProvider).registrarPago(
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
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Monto',
                prefixText: '\$ ',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_cliente_pago_nota'),
              controller: _nota,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'Nota (opcional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
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
