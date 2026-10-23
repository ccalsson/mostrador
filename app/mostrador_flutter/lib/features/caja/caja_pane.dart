import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers.dart';

/// Panel de caja con sección de egresos del turno — paridad con la web.
class CajaPane extends ConsumerStatefulWidget {
  const CajaPane({super.key});

  @override
  ConsumerState<CajaPane> createState() => _CajaPaneState();
}

class _CajaPaneState extends ConsumerState<CajaPane> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(egresosTurnoProvider.notifier).cargar());
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(egresosTurnoProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Estado de caja
          _EstadoCajaCard(estado: estado),
          const SizedBox(height: 16),
          // Sección de egresos
          _EgresosSeccion(estado: estado),
        ],
      ),
    );
  }
}

/// Tarjeta con el estado de caja: cobrado - egresos = esperado.
class _EstadoCajaCard extends StatelessWidget {
  const _EstadoCajaCard({required this.estado});
  final EgresosTurnoState estado;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Estado de caja', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            if (estado.isLoading)
              const LinearProgressIndicator()
            else ...[
              _fila('Egresos en efectivo', _money(estado.totalEfectivo), theme),
              _fila('Total egresos', _money(estado.totalGeneral), theme),
              const Divider(height: 16),
              Text(
                'Esperado = Cobrado − Egresos efectivo',
                style: theme.textTheme.bodySmall,
              ),
            ],
            if (estado.error != null) ...[
              const SizedBox(height: 8),
              Text(estado.error!,
                  style: TextStyle(color: theme.colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _fila(String label, String value, ThemeData theme) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: theme.textTheme.bodyMedium),
            Text(value,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

/// Sección de egresos: lista + formulario.
class _EgresosSeccion extends StatelessWidget {
  const _EgresosSeccion({required this.estado});
  final EgresosTurnoState estado;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Egresos del turno', style: theme.textTheme.titleMedium),
                const Spacer(),
                FilledButton.icon(
                  onPressed: () => _mostrarFormulario(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Nuevo egreso'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'En efectivo sale de la caja. Transferencia u otro queda en el negocio.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (estado.items.isEmpty && !estado.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('Sin egresos en este turno.')),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: estado.items.length,
                itemBuilder: (context, i) {
                  final e = estado.items[i];
                  return _EgresoTile(egreso: e);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _mostrarFormulario(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => const _EgresoFormDialog(),
    );
  }
}

/// Tile individual de un egreso en la lista.
class _EgresoTile extends ConsumerWidget {
  const _EgresoTile({required this.egreso});
  final Egreso egreso;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cat = categoriasEgreso
        .where((c) => c.id == egreso.categoria)
        .firstOrNull;
    return ListTile(
      dense: true,
      leading: CircleAvatar(
        radius: 16,
        child: Text(_iniciales(cat?.label ?? egreso.categoria)),
      ),
      title: Text(
          egreso.concepto.isEmpty
              ? cat?.label ?? egreso.categoria
              : egreso.concepto),
      subtitle:
          Text('${cat?.label ?? egreso.categoria} · ${medioPagoLabel(egreso.medio)}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(_money(egreso.monto),
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 18),
            onPressed: () => _confirmarBorrar(context, ref),
          ),
        ],
      ),
    );
  }

  void _confirmarBorrar(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Borrar egreso'),
        content: Text('¿Borrar "${egreso.concepto}"?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref
                  .read(egresosTurnoProvider.notifier)
                  .eliminar(egreso.id);
            },
            child: const Text('Borrar'),
          ),
        ],
      ),
    );
  }
}

/// Diálogo con el formulario de nuevo egreso.
class _EgresoFormDialog extends ConsumerStatefulWidget {
  const _EgresoFormDialog();

  @override
  ConsumerState<_EgresoFormDialog> createState() => _EgresoFormDialogState();
}

class _EgresoFormDialogState extends ConsumerState<_EgresoFormDialog> {
  final _formKey = GlobalKey<FormState>();
  String _categoria = 'servicios';
  MedioPago _medio = MedioPago.efectivo;
  final _conceptoCtrl = TextEditingController();
  final _montoCtrl = TextEditingController();
  bool _guardando = false;

  @override
  void dispose() {
    _conceptoCtrl.dispose();
    _montoCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nuevo egreso'),
      content: SizedBox(
        width: 480,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _categoria,
                decoration: const InputDecoration(labelText: 'Categoría'),
                items: categoriasEgreso
                    .map((c) => DropdownMenuItem(
                        value: c.id, child: Text(c.label)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _categoria = v);
                },
              ),
              TextFormField(
                controller: _conceptoCtrl,
                decoration: const InputDecoration(labelText: 'Concepto'),
                textInputAction: TextInputAction.next,
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Decí en qué se fue'
                    : null,
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _montoCtrl,
                decoration: const InputDecoration(labelText: 'Monto'),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  if (v == null || v.isEmpty) {
                    return 'El monto es obligatorio';
                  }
                  final n = double.tryParse(v);
                  if (n == null || !(n > 0)) return 'Monto inválido';
                  if (n > 99999999) return 'Monto demasiado grande';
                  return null;
                },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<MedioPago>(
                initialValue: _medio,
                decoration: const InputDecoration(labelText: 'Medio'),
                items: MedioPago.values
                    .map((m) => DropdownMenuItem(
                          value: m,
                          child: Text(medioPagoLabel(m)),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _medio = v);
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _guardando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _guardando ? null : _guardar,
          child: _guardando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Anotar egreso'),
        ),
      ],
    );
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    if (!Egreso.categoriaValida(_categoria)) return;

    setState(() => _guardando = true);
    final monto = double.parse(_montoCtrl.text);
    final egreso = Egreso(
      id: '',
      categoria: _categoria,
      concepto: _conceptoCtrl.text.trim(),
      monto: monto,
      medio: _medio,
      createdAt: '',
    );
    final ok =
        await ref.read(egresosTurnoProvider.notifier).agregar(egreso);
    if (mounted) {
      if (ok) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Egreso anotado.')),
        );
      } else {
        setState(() => _guardando = false);
        final error = ref.read(egresosTurnoProvider).error;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error ?? 'Error al guardar')),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

String _money(double n) => '\$${n.toStringAsFixed(2)}';

String _iniciales(String texto) {
  if (texto.isEmpty) return '?';
  final parts = texto.split(' ');
  if (parts.length == 1) return parts[0][0].toUpperCase();
  return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
}
