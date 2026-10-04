import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/remito.dart';
import '../../services/catalogo_service.dart';
import '../../services/remitos_service.dart';

class RemitoDetallePane extends ConsumerWidget {
  const RemitoDetallePane({required this.remitoId, super.key});

  final String remitoId;

  Future<void> _confirmar(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(remitosServiceProvider).confirmar(remitoId);
      if (!context.mounted) return;
      ref.invalidate(remitosProvider);
      ref.invalidate(remitoProvider(remitoId));
      ref.invalidate(catalogoProvider); // Actualiza stock
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Remito confirmado y stock actualizado.')),
      );
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remitoAsync = ref.watch(remitoProvider(remitoId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle de Remito'),
      ),
      body: remitoAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Error al cargar detalle')),
        data: (remito) {
          final puedeConfirmar = remito.estado != 'confirmado' &&
              remito.items.any((i) => i.confirmado);

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          remito.proveedor ?? 'Sin proveedor',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        Text(
                          'Estado: ${remito.estado.toUpperCase()}',
                          style: TextStyle(
                            color: remito.estado == 'confirmado'
                                ? Colors.green
                                : Colors.orange,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    if (remito.estado != 'confirmado')
                      FilledButton.icon(
                        onPressed: puedeConfirmar
                            ? () => _confirmar(context, ref)
                            : null,
                        icon: const Icon(Icons.check),
                        label: const Text('Confirmar Ingreso'),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: remito.items.length,
                  itemBuilder: (context, index) {
                    final item = remito.items[index];
                    return _RemitoItemTile(remitoId: remito.id, item: item);
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RemitoItemTile extends ConsumerWidget {
  const _RemitoItemTile({required this.remitoId, required this.item});

  final String remitoId;
  final RemitoItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Busca el producto en el catálogo
    final catalogo = ref.watch(catalogoProvider).value?.productos ?? [];
    final prod = item.productoId != null
        ? catalogo.where((p) => p.id == item.productoId).firstOrNull
        : null;

    return ListTile(
      tileColor: item.confirmado
          ? Colors.green.withValues(alpha: 0.1)
          : null,
      title: Text(item.descripcionOriginal),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (prod != null)
            Text('Mapeado a: ${prod.nombre}', style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('Cantidad: ${cantidadNum(item.cantidad)}'),
        ],
      ),
      trailing: Checkbox(
        value: item.confirmado,
        onChanged: (val) async {
          if (val == null) return;
          try {
            await ref.read(remitosServiceProvider).actualizarItem(
                  id: item.id,
                  productoId: item.productoId,
                  cantidad: item.cantidad,
                  confirmado: val,
                );
            ref.invalidate(remitoProvider(remitoId));
          } catch (e) {
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Error al actualizar línea.')),
            );
          }
        },
      ),
    );
  }
}
