import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/cliente.dart';
import '../../services/clientes_service.dart';
import 'cliente_form_dialog.dart';

class ClientesPane extends ConsumerWidget {
  const ClientesPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clientes = ref.watch(clientesProvider);
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
                onPressed: () => mostrarFormCliente(context),
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
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text('No hay clientes.', key: Key('clientes_vacia')),
                );
              }
              return ListView.separated(
                key: const Key('admin_clientes_lista'),
                itemCount: lista.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final cliente = lista[index];
                  return ListTile(
                    key: Key('admin_cliente_${cliente.id}'),
                    leading: CircleAvatar(
                      child: Text(
                        cliente.nombre.isNotEmpty
                            ? cliente.nombre[0].toUpperCase()
                            : '?',
                      ),
                    ),
                    title: Text(cliente.nombre),
                    subtitle: Text(cliente.telefono ?? 'Sin teléfono'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (cliente.cuentaCorriente)
                          const Chip(
                            label: Text('Cuenta Cte.'),
                            visualDensity: VisualDensity.compact,
                          ),
                        IconButton(
                          key: Key('admin_editar_cliente_${cliente.id}'),
                          icon: const Icon(Icons.edit_outlined),
                          tooltip: 'Editar cliente',
                          onPressed: () =>
                              mostrarFormCliente(context, existente: cliente),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.account_balance_wallet_outlined,
                          ),
                          tooltip: 'Ver cuenta',
                          onPressed: () => _mostrarCuenta(context, cliente),
                        ),
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  void _mostrarCuenta(BuildContext context, Cliente cliente) {
    showDialog<void>(
      context: context,
      builder: (_) => _CuentaCorrienteDialog(cliente: cliente),
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
