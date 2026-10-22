import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/egreso.dart';
import '../../services/egresos_service.dart';

class EgresosPane extends ConsumerWidget {
  const EgresosPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final egresos = ref.watch(egresosProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Egresos de caja',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
              FilledButton.icon(
                key: const Key('egreso_nuevo'),
                onPressed: () => mostrarDialogoNuevoEgreso(context, ref),
                icon: const Icon(Icons.remove_circle_outline),
                label: const Text('Nuevo egreso'),
              ),
            ],
          ),
        ),
        Expanded(
          child: egresos.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudieron cargar los egresos.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    onPressed: () => ref.invalidate(egresosProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text('No hay egresos en este turno de caja.'),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: lista.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) => _EgresoTile(egreso: lista[index]),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _EgresoTile extends ConsumerWidget {
  const _EgresoTile({required this.egreso});

  final Egreso egreso;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      child: ListTile(
        key: Key('egreso_${egreso.id}'),
        leading: CircleAvatar(
          backgroundColor: colorScheme.errorContainer,
          child: Icon(Icons.trending_down, color: colorScheme.onErrorContainer),
        ),
        title: Text(egreso.concepto),
        subtitle: Text(
          '${egreso.usuarioNombre} · ${egreso.categoria} · ${_fechaCorta(egreso.creadoAt)}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              moneda(egreso.monto),
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: colorScheme.error,
                fontSize: 16,
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              key: Key('egreso_anular_${egreso.id}'),
              tooltip: 'Anular',
              icon: const Icon(Icons.delete_outline),
              onPressed: () => _confirmarAnular(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmarAnular(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Anular egreso'),
        content: Text('¿Anular "${egreso.concepto}" por ${moneda(egreso.monto)}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton.tonal(onPressed: () => Navigator.pop(ctx, true), child: const Text('Anular')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(egresosServiceProvider).anular(egreso.id);
      ref.invalidate(egresosProvider);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Egreso anulado.')));
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('No se pudo anular el egreso.')));
    }
  }

  String _fechaCorta(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

Future<void> mostrarDialogoNuevoEgreso(BuildContext context, WidgetRef ref) async {
  final conceptoCtrl = TextEditingController();
  final montoCtrl = TextEditingController();
  var categoria = 'gasto';

  final resultado = await showDialog<Map<String, String>>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDialogState) => AlertDialog(
        title: const Text('Nuevo egreso'),
        content: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const Key('egreso_concepto'),
                controller: conceptoCtrl,
                decoration: const InputDecoration(
                  labelText: 'Concepto',
                  hintText: 'Ej: Pago a proveedor',
                ),
                maxLength: 200,
              ),
              TextField(
                key: const Key('egreso_monto'),
                controller: montoCtrl,
                decoration: const InputDecoration(
                  labelText: 'Monto',
                  prefixText: '\$ ',
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: categoria,
                decoration: const InputDecoration(labelText: 'Categoría'),
                items: const [
                  DropdownMenuItem(value: 'gasto', child: Text('Gasto')),
                  DropdownMenuItem(value: 'retiro', child: Text('Retiro personal')),
                  DropdownMenuItem(value: 'pago_proveedor', child: Text('Pago a a proveedor')),
                  DropdownMenuItem(value: 'otro', child: Text('Otro')),
                ],
                onChanged: (v) => setDialogState(() => categoria = v ?? 'gasto'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            key: const Key('egreso_guardar'),
            onPressed: () {
              if (conceptoCtrl.text.trim().isEmpty || montoCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, {
                'concepto': conceptoCtrl.text.trim(),
                'monto': montoCtrl.text.trim(),
                'categoria': categoria,
              });
            },
            child: const Text('Registrar'),
          ),
        ],
      ),
    ),
  );

  conceptoCtrl.dispose();
  montoCtrl.dispose();

  if (resultado == null || !context.mounted) return;

  final montoNum = double.tryParse(resultado['monto']!);
  if (montoNum == null || montoNum <= 0) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..removeCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Monto inválido.')));
    return;
  }

  try {
    await ref.read(egresosServiceProvider).crear(
          monto: montoNum,
          concepto: resultado['concepto']!,
          categoria: resultado['categoria'],
        );
    ref.invalidate(egresosProvider);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..removeCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Egreso registrado.')));
  } on ApiException catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..removeCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(e.message)));
  } catch (_) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..removeCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('No se pudo registrar el egreso.')));
  }
}
