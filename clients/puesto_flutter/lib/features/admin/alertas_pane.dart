import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/alerta.dart';
import '../../services/alertas_service.dart';

/// Bandeja de alertas del tablero (últimas 30, no leídas primero).
class AlertasPane extends ConsumerWidget {
  const AlertasPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertas = ref.watch(alertasProvider);
    return alertas.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error is ApiException
                ? error.message
                : 'No se pudieron cargar las alertas.'),
            const SizedBox(height: 16),
            FilledButton.tonal(
              key: const Key('alertas_reintentar'),
              onPressed: () => ref.invalidate(alertasProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
      data: (lista) {
        if (lista.isEmpty) {
          return const Center(
            child: Text('No hay alertas.', key: Key('alertas_vacia')),
          );
        }
        final sinLeer = lista.where((a) => !a.leida).length;
        return ListView.separated(
          key: const Key('alertas_lista'),
          itemCount: lista.length + 1,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (context, index) {
            if (index == lista.length) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  '$sinLeer sin leer de ${lista.length}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              );
            }
          return _AlertaTile(alerta: lista[index]);
        },
      );
    },
    );
  }
}

class _AlertaTile extends ConsumerWidget {
  const _AlertaTile({required this.alerta});

  final Alerta alerta;

  Future<void> _marcar(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(alertasServiceProvider).marcarLeida(alerta.id);
      ref.invalidate(alertasProvider);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('No se pudo marcar la alerta.')),
        );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      key: Key('alerta_${alerta.id}'),
      leading: Icon(
        alerta.tipo == 'stock_bajo'
            ? Icons.warning_amber_outlined
            : Icons.info_outline,
      ),
      title: Text(alerta.mensaje),
      subtitle: Text(fechaCorta(alerta.creada)),
      enabled: !alerta.leida,
      trailing: alerta.leida
          ? null
          : TextButton(
              key: Key('alerta_leer_${alerta.id}'),
              onPressed: () => _marcar(context, ref),
              child: const Text('Marcar leída'),
            ),
    );
  }
}
