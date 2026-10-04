import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../services/auditoria_service.dart';

class AuditoriaPane extends ConsumerWidget {
  const AuditoriaPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auditoria = ref.watch(auditoriaProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Text(
                'Auditoría',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(auditoriaProvider),
                tooltip: 'Actualizar',
              )
            ],
          ),
        ),
        Expanded(
          child: auditoria.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Error al cargar auditoría.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(auditoriaProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text('No hay registros de auditoría.'),
                );
              }
              return ListView.separated(
                itemCount: lista.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final reg = lista[index];
                  return ListTile(
                    leading: const Icon(Icons.history, color: Colors.grey),
                    title: Text('${reg.accion.toUpperCase()} - ${reg.entidad}'),
                    subtitle: Text('${fechaCorta(reg.createdAt)} · Por: ${reg.usuarioNombre ?? 'Sistema'}'),
                    onTap: () => _mostrarDetalle(context, reg.detalle),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  void _mostrarDetalle(BuildContext context, String detalle) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Detalle de auditoría'),
        content: SingleChildScrollView(
          child: SelectableText(detalle),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }
}
