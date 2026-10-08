import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
                      child: Text(cliente.nombre.isNotEmpty
                          ? cliente.nombre[0].toUpperCase()
                          : '?'),
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
                          icon: const Icon(Icons.account_balance_wallet_outlined),
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
          error: (error, _) => Center(child: Text('No se pudo cargar la cuenta.')),
          data: (data) => Column(
            children: [
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Saldo Actual', style: TextStyle(fontSize: 18)),
                      Text(
                        moneda(data.saldo),
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: data.saldo < 0 ? Colors.red : Colors.green,
                        ),
                      ),
                    ],
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
                      subtitle: Text('${fechaCorta(mov.createdAt)} - ${mov.nota ?? ""}'),
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
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }
}
