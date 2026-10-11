import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/proveedor.dart';
import '../../services/proveedores_service.dart';
import 'proveedor_form_dialog.dart';

class ProveedoresPane extends ConsumerWidget {
  const ProveedoresPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final proveedores = ref.watch(proveedoresProvider);

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
                onPressed: () => mostrarFormProveedor(context),
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
            data: (lista) => lista.isEmpty
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
                    itemBuilder: (context, index) =>
                        _ProveedorTile(proveedor: lista[index]),
                  ),
          ),
        ),
      ],
    );
  }
}

class _ProveedorTile extends StatelessWidget {
  const _ProveedorTile({required this.proveedor});

  final Proveedor proveedor;

  @override
  Widget build(BuildContext context) {
    final datos = proveedor.cuit?.isNotEmpty == true
        ? proveedor.cuit
        : proveedor.telefono?.isNotEmpty == true
        ? proveedor.telefono
        : 'Sin datos';

    return ListTile(
      key: Key('admin_proveedor_${proveedor.id}'),
      leading: const Icon(Icons.local_shipping_outlined),
      title: Text(proveedor.nombre),
      subtitle: Text(datos ?? 'Sin datos'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Chip(
            label: Text(proveedor.activo ? 'Activo' : 'Baja'),
            visualDensity: VisualDensity.compact,
          ),
          IconButton(
            key: Key('admin_editar_proveedor_${proveedor.id}'),
            tooltip: 'Editar proveedor',
            onPressed: () =>
                mostrarFormProveedor(context, existente: proveedor),
            icon: const Icon(Icons.edit_outlined),
          ),
        ],
      ),
      onTap: () => mostrarFormProveedor(context, existente: proveedor),
    );
  }
}
