import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/producto.dart';
import '../../services/productos_service.dart';
import 'producto_form_controller.dart';

/// Diálogo de alta (`existente == null`) o edición de producto, con baja
/// lógica en el caso de edición.
Future<void> mostrarFormProducto(BuildContext context, {Producto? existente}) {
  return showDialog<void>(
    context: context,
    builder: (_) => _ProductoFormDialog(existente: existente),
  );
}

class _ProductoFormDialog extends ConsumerStatefulWidget {
  const _ProductoFormDialog({this.existente});

  final Producto? existente;

  @override
  ConsumerState<_ProductoFormDialog> createState() =>
      _ProductoFormDialogState();
}

class _ProductoFormDialogState extends ConsumerState<_ProductoFormDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _unidadLabel;
  late final TextEditingController _precio;
  late final TextEditingController _minimo;
  late final TextEditingController _alias;
  late final TextEditingController _inicial;
  late String _unidad;
  late bool _activo;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    final p = widget.existente;
    _nombre = TextEditingController(text: p?.nombre ?? '');
    _unidadLabel = TextEditingController(text: p?.unidadLabel ?? 'kg');
    _precio =
        TextEditingController(text: p == null ? '' : cantidadNum(p.precio));
    _minimo = TextEditingController(
        text: p == null ? '' : cantidadNum(p.stockMinimo));
    _alias = TextEditingController(text: p?.alias.join(', ') ?? '');
    _inicial = TextEditingController();
    _unidad = p?.unidad ?? 'kg';
    _activo = p?.activo ?? true;
    Future.microtask(() {
      if (mounted) ref.read(productoFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _unidadLabel.dispose();
    _precio.dispose();
    _minimo.dispose();
    _alias.dispose();
    _inicial.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    final unidadLabel = _unidadLabel.text.trim();
    final precio = parseDecimal(_precio.text);
    final minimo = parseDecimal(_minimo.text);
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre.');
    }
    if (unidadLabel.isEmpty || unidadLabel.length > 20) {
      return setState(
          () => _validacion = 'Etiqueta de unidad requerida (máx. 20).');
    }
    if (precio == null || precio <= 0) {
      return setState(() => _validacion = 'Precio inválido.');
    }
    if (minimo == null || minimo < 0) {
      return setState(() => _validacion = 'Stock mínimo inválido.');
    }
    double? inicial;
    final textoInicial = _inicial.text.trim();
    if (widget.existente == null && textoInicial.isNotEmpty) {
      inicial = parseDecimal(textoInicial);
      if (inicial == null) {
        return setState(() => _validacion = 'Stock inicial inválido.');
      }
    }
    setState(() => _validacion = null);
    final ok = await ref.read(productoFormProvider.notifier).guardar(
          ProductoInput(
            id: widget.existente?.id,
            nombre: nombre,
            unidad: _unidad,
            unidadLabel: unidadLabel,
            precio: precio,
            stockMinimo: minimo,
            alias: _alias.text
                .split(',')
                .map((a) => a.trim())
                .where((a) => a.isNotEmpty)
                .toList(),
            activo: _activo,
            stockInicial: inicial,
          ),
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  Future<void> _bajar() async {
    final p = widget.existente!;
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dar de baja'),
        content: Text(
          '¿Dar de baja "${p.nombre}"? Podés reactivarlo después editándolo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('admin_confirmar_baja'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Dar de baja'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;
    final ok = await ref.read(productoFormProvider.notifier).bajar(p.id);
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(productoFormProvider);
    final p = widget.existente;
    final error = _validacion ?? estado.errorMensaje;
    return AlertDialog(
      title: Text(p == null ? 'Nuevo producto' : 'Editar ${p.nombre}'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                key: const Key('admin_prod_nombre'),
                controller: _nombre,
                decoration: const InputDecoration(labelText: 'Nombre'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      key: const Key('admin_prod_unidad'),
                      initialValue: _unidad,
                      decoration: const InputDecoration(labelText: 'Unidad'),
                      items: const [
                        DropdownMenuItem(value: 'kg', child: Text('kg')),
                        DropdownMenuItem(value: 'bulto', child: Text('bulto')),
                      ],
                      onChanged: (valor) =>
                          setState(() => _unidad = valor ?? 'kg'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      key: const Key('admin_prod_unidad_label'),
                      controller: _unidadLabel,
                      maxLength: 20,
                      decoration: const InputDecoration(
                        labelText: 'Etiqueta (ej. kg, cajón x10)',
                        counterText: '',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('admin_prod_precio'),
                      controller: _precio,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Precio'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      key: const Key('admin_prod_minimo'),
                      controller: _minimo,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration:
                          const InputDecoration(labelText: 'Stock mínimo'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_prod_alias'),
                controller: _alias,
                decoration: const InputDecoration(
                  labelText: 'Alias (separados por coma)',
                  hintText: 'banana, banana ecluer',
                ),
              ),
              if (p == null) ...[
                const SizedBox(height: 12),
                TextField(
                  key: const Key('admin_prod_inicial'),
                  controller: _inicial,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Stock inicial (opcional)',
                  ),
                ),
              ],
              if (p != null)
                SwitchListTile(
                  key: const Key('admin_prod_activo'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Activo'),
                  value: _activo,
                  onChanged: (valor) => setState(() => _activo = valor),
                ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  key: const Key('admin_prod_error'),
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        if (p != null && p.activo)
          TextButton(
            key: const Key('admin_baja_producto'),
            onPressed: estado.enviando ? null : _bajar,
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Dar de baja'),
          ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(
              onPressed: estado.enviando ? null : () => Navigator.of(context).pop(),
              child: const Text('Cancelar'),
            ),
            const SizedBox(width: 8),
            FilledButton(
              key: const Key('admin_guardar_producto'),
              onPressed: estado.enviando ? null : _guardar,
              child: estado.enviando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Guardar'),
            ),
          ],
        ),
      ],
    );
  }
}
