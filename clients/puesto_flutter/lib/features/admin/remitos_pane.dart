import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../services/remitos_service.dart';
import 'remito_detalle_pane.dart';

class RemitosPane extends ConsumerWidget {
  const RemitosPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remitos = ref.watch(remitosProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Text(
                'Remitos',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(remitosProvider),
                tooltip: 'Actualizar',
              )
            ],
          ),
        ),
        Expanded(
          child: remitos.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Error al cargar remitos.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(remitosProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text('No hay remitos pendientes.'),
                );
              }
              return ListView.separated(
                itemCount: lista.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final remito = lista[index];
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: remito.estado == 'confirmado'
                          ? Colors.green.withValues(alpha: 0.2)
                          : Colors.orange.withValues(alpha: 0.2),
                      child: Icon(
                        remito.estado == 'confirmado'
                            ? Icons.check
                            : Icons.assignment_outlined,
                        color: remito.estado == 'confirmado'
                            ? Colors.green
                            : Colors.orange,
                      ),
                    ),
                    title: Text(remito.proveedor ?? 'Proveedor desconocido'),
                    subtitle: Text('${fechaCorta(remito.createdAt)} · Fuente: ${remito.fuente}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => RemitoDetallePane(remitoId: remito.id),
                      ),
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
}
