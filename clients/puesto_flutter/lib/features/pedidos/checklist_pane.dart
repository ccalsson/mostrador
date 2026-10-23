import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/checklist.dart';
import '../../services/checklist_service.dart';

/// Panel de checklist de entrega para un pedido.
///
/// Muestra los items con checkbox, boton para agregar, y un indicador visual
/// de progreso. Paridad con la web (`entrega-lista.tsx`): cada item se tilda
/// individualmente; todos completados = habilita entregar, alguno pendiente =
/// bloquea.
class ChecklistPane extends ConsumerStatefulWidget {
  const ChecklistPane({super.key, required this.pedidoId});

  final String pedidoId;

  @override
  ConsumerState<ChecklistPane> createState() => _ChecklistPaneState();
}

class _ChecklistPaneState extends ConsumerState<ChecklistPane> {
  final _controller = TextEditingController();
  bool _agregando = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _agregar() async {
    final texto = _controller.text.trim();
    if (texto.isEmpty) return;
    setState(() {
      _agregando = true;
      _error = null;
    });
    try {
      await ref
          .read(checklistServiceProvider)
          .crearItem(widget.pedidoId, texto);
      _controller.clear();
      ref.invalidate(checklistItemsProvider(widget.pedidoId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'No se pudo agregar el item.');
      }
    } finally {
      if (mounted) setState(() => _agregando = false);
    }
  }

  Future<void> _toggle(ChecklistItem item) async {
    try {
      await ref
          .read(checklistServiceProvider)
          .toggleItem(widget.pedidoId, item.id, !item.completado);
      ref.invalidate(checklistItemsProvider(widget.pedidoId));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }

  Future<void> _borrar(ChecklistItem item) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Borrar item'),
        content: Text('¿Borrar "${item.descripcion}" del checklist?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton.tonal(
            key: const Key('checklist_borrar_confirmar'),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Borrar'),
          ),
        ],
      ),
    );
    if (confirmado != true) return;
    try {
      await ref
          .read(checklistServiceProvider)
          .borrarItem(widget.pedidoId, item.id);
      ref.invalidate(checklistItemsProvider(widget.pedidoId));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(checklistItemsProvider(widget.pedidoId));
    final tema = Theme.of(context);

    return Column(
      children: [
        // Barra de progreso
        items.when(
          data: (data) => _Progreso(items: data, tema: tema),
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
        // Lista de items
        Expanded(
          child: items.when(
            data: (data) => data.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text(
                        'No hay items en el checklist.\nAgrega items para verificar antes de entregar.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.separated(
                    key: const Key('checklist_lista'),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: data.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: 1, indent: 56),
                    itemBuilder: (_, i) {
                      final item = data[i];
                      return _ItemTile(
                        key: Key('checklist_item_${item.id}'),
                        item: item,
                        onToggle: () => _toggle(item),
                        onDelete: () => _borrar(item),
                      );
                    },
                  ),
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (error, _) => _ErrorChecklist(
              mensaje: error is ApiException
                  ? error.message
                  : 'No se pudo cargar el checklist.',
              onReintentar: () =>
                  ref.invalidate(checklistItemsProvider(widget.pedidoId)),
            ),
          ),
        ),
        const Divider(height: 1),
        // Input para agregar
        _InputAgregar(
          controller: _controller,
          agregando: _agregando,
          error: _error,
          onAgregar: _agregar,
        ),
      ],
    );
  }
}

class _Progreso extends StatelessWidget {
  const _Progreso({required this.items, required this.tema});

  final List<ChecklistItem> items;
  final ThemeData tema;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final total = items.length;
    final completados = items.where((i) => i.completado).length;
    final todos = completados == total;
    final fraccion = total > 0 ? completados / total : 0.0;

    return Container(
      key: const Key('checklist_progreso'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                todos ? Icons.check_circle : Icons.pending_actions,
                size: 18,
                color: todos
                    ? tema.colorScheme.primary
                    : tema.colorScheme.outline,
              ),
              const SizedBox(width: 8),
              Text(
                todos
                    ? 'Listo para entregar'
                    : '$completados de $total completados',
                style: tema.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: todos
                      ? tema.colorScheme.primary
                      : tema.colorScheme.onSurface,
                ),
              ),
              const Spacer(),
              Text(
                '${(fraccion * 100).round()}%',
                style: tema.textTheme.bodySmall?.copyWith(
                  color: tema.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              key: const Key('checklist_barra'),
              value: fraccion,
              minHeight: 6,
              backgroundColor: tema.colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation(
                todos
                    ? tema.colorScheme.primary
                    : tema.colorScheme.tertiary,
              ),
            ),
          ),
          if (!todos)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Completa todos los items para habilitar la entrega.',
                style: tema.textTheme.bodySmall?.copyWith(
                  color: tema.colorScheme.outline,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({
    super.key,
    required this.item,
    required this.onToggle,
    required this.onDelete,
  });

  final ChecklistItem item;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return ListTile(
      leading: Checkbox(
        key: Key('checklist_checkbox_${item.id}'),
        value: item.completado,
        onChanged: (_) => onToggle(),
      ),
      title: Text(
        item.descripcion,
        style: TextStyle(
          decoration:
              item.completado ? TextDecoration.lineThrough : null,
          color: item.completado
              ? tema.colorScheme.onSurfaceVariant
              : null,
        ),
      ),
      trailing: IconButton(
        key: Key('checklist_borrar_${item.id}'),
        tooltip: 'Borrar item',
        icon: Icon(
          Icons.close,
          size: 18,
          color: tema.colorScheme.outline,
        ),
        onPressed: onDelete,
      ),
    );
  }
}

class _InputAgregar extends StatelessWidget {
  const _InputAgregar({
    required this.controller,
    required this.agregando,
    required this.error,
    required this.onAgregar,
  });

  final TextEditingController controller;
  final bool agregando;
  final String? error;
  final VoidCallback onAgregar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(
        children: [
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                error!,
                key: const Key('checklist_error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('checklist_input'),
                  controller: controller,
                  enabled: !agregando,
                  decoration: const InputDecoration(
                    hintText: 'Nuevo item del checklist...',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => onAgregar(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                key: const Key('checklist_agregar'),
                onPressed: agregando ? null : onAgregar,
                child: agregando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorChecklist extends StatelessWidget {
  const _ErrorChecklist({required this.mensaje, required this.onReintentar});

  final String mensaje;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: const Key('checklist_reintentar'),
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
