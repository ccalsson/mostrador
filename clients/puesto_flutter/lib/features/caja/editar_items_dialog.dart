import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../models/pedido.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import 'edicion_items_controller.dart';

class _LineaEditable {
  _LineaEditable({
    required this.productoId,
    required this.nombre,
    required this.precio,
    required this.unidadLabel,
    required String cantidad,
  }) : ctrl = TextEditingController(text: cantidad);

  final String productoId;
  final String nombre;
  final double precio;
  final String unidadLabel;
  final TextEditingController ctrl;

  /// `0` (inválido) si el texto no parsea.
  double get cantidad => parseDecimal(ctrl.text) ?? 0;

  void dispose() => ctrl.dispose();
}

/// Edición de los ítems de un pedido (`POST /api/v1/pedidos/:id/items`).
/// El total mostrado es una estimación; el definitivo lo recalcula el backend
/// con los precios vigentes del catálogo.
class EditarItemsDialog extends ConsumerStatefulWidget {
  const EditarItemsDialog({super.key, required this.pedido});

  final Pedido pedido;

  @override
  ConsumerState<EditarItemsDialog> createState() => _EditarItemsDialogState();
}

class _EditarItemsDialogState extends ConsumerState<EditarItemsDialog> {
  late final List<_LineaEditable> _lineas = [
    for (final item in widget.pedido.items)
      _LineaEditable(
        productoId: item.productoId,
        nombre: item.nombre,
        precio: item.precioUnitario,
        unidadLabel: item.unidadLabel,
        cantidad: cantidadNum(item.cantidad),
      ),
  ];
  bool _cerrado = false;

  @override
  void dispose() {
    for (final linea in _lineas) {
      linea.dispose();
    }
    super.dispose();
  }

  double get _totalEstimado =>
      redondear2(_lineas.fold(0, (acc, linea) => acc + linea.cantidad * linea.precio));

  bool get _valido =>
      _lineas.isNotEmpty &&
      _lineas.every((linea) => parseDecimal(linea.ctrl.text) != null && linea.cantidad > 0);

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final edicion = ref.watch(edicionItemsControllerProvider(widget.pedido.id));
    ref.listen(edicionItemsControllerProvider(widget.pedido.id), (anterior, siguiente) {
      if (siguiente.exito && !_cerrado) {
        _cerrado = true;
        Navigator.pop(context);
      }
    });
    return AlertDialog(
      key: const Key('items_dialogo'),
      title: Text('Editar ítems · Nº ${widget.pedido.id}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Ítems del pedido', style: tema.textTheme.titleSmall),
                ),
                TextButton.icon(
                  key: const Key('items_agregar'),
                  onPressed: edicion.guardando ? null : _agregarProducto,
                  icon: const Icon(Icons.add),
                  label: const Text('Agregar'),
                ),
              ],
            ),
            for (final linea in _lineas)
              Padding(
                key: Key('items_fila_${linea.productoId}'),
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${linea.nombre} · ${moneda(linea.precio)}/${linea.unidadLabel}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    SizedBox(
                      width: 92,
                      child: TextField(
                        key: Key('items_cantidad_${linea.productoId}'),
                        controller: linea.ctrl,
                        enabled: !edicion.guardando,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        textAlign: TextAlign.right,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          isDense: true,
                          labelText: 'Cant.',
                          errorText:
                              parseDecimal(linea.ctrl.text) == null ? 'Inválida' : null,
                        ),
                      ),
                    ),
                    IconButton(
                      key: Key('items_quitar_${linea.productoId}'),
                      tooltip: 'Quitar',
                      onPressed: edicion.guardando
                          ? null
                          : () => setState(() {
                                _lineas.remove(linea);
                                linea.dispose();
                              }),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            if (_lineas.isEmpty)
              Text(
                'Agregá al menos un producto.',
                style: tema.textTheme.bodySmall,
              ),
            const Divider(),
            Text(
              'Total estimado: ${moneda(_totalEstimado)}',
              key: const Key('items_total_estimado'),
              style: tema.textTheme.titleMedium,
            ),
            Text(
              'El backend recalcula el total al guardar.',
              style: tema.textTheme.bodySmall,
            ),
            if (edicion.fase == EdicionFase.error) ...[
              const SizedBox(height: 12),
              Material(
                key: const Key('items_error'),
                color: tema.colorScheme.errorContainer,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text(
                    edicion.errorMensaje ?? 'No se pudieron actualizar los ítems.',
                    style: TextStyle(color: tema.colorScheme.onErrorContainer),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          key: const Key('items_cancelar'),
          onPressed: edicion.guardando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('items_guardar'),
          onPressed: (edicion.guardando || !_valido) ? null : _confirmar,
          child: edicion.guardando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Guardar cambios'),
        ),
      ],
    );
  }

  Future<void> _confirmar() async {
    final aceptado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => const _DialogoConfirmarItems(),
    );
    if (aceptado != true) return;
    await ref.read(edicionItemsControllerProvider(widget.pedido.id).notifier).guardar([
      for (final linea in _lineas)
        (productoId: linea.productoId, cantidad: linea.cantidad),
    ]);
  }

  Future<void> _agregarProducto() async {
    final producto = await showDialog<Producto>(
      context: context,
      builder: (dialogContext) => _PickerProducto(
        excluidos: {for (final linea in _lineas) linea.productoId},
      ),
    );
    if (producto == null || !mounted) return;
    setState(() {
      _lineas.add(_LineaEditable(
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        unidadLabel: producto.unidadLabel,
        cantidad: '1',
      ));
    });
  }
}

/// Diálogo con guard local: un doble tap no dispara dos `pop`.
class _DialogoConfirmarItems extends StatefulWidget {
  const _DialogoConfirmarItems();

  @override
  State<_DialogoConfirmarItems> createState() => _DialogoConfirmarItemsState();
}

class _DialogoConfirmarItemsState extends State<_DialogoConfirmarItems> {
  bool _cerrado = false;

  void _responder(bool valor) {
    if (_cerrado) return;
    _cerrado = true;
    Navigator.pop(context, valor);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: const Key('items_confirmar'),
      title: const Text('Confirmar cambios'),
      content: const Text(
        '¿Reemplazar los ítems del pedido por los ingresados? '
        'Se recalculan los precios con el catálogo vigente.',
      ),
      actions: [
        TextButton(
          key: const Key('items_confirmar_cancelar'),
          onPressed: () => _responder(false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('items_confirmar_aceptar'),
          onPressed: () => _responder(true),
          child: const Text('Confirmar cambios'),
        ),
      ],
    );
  }
}

class _PickerProducto extends ConsumerStatefulWidget {
  const _PickerProducto({required this.excluidos});

  final Set<String> excluidos;

  @override
  ConsumerState<_PickerProducto> createState() => _PickerProductoState();
}

class _PickerProductoState extends ConsumerState<_PickerProducto> {
  String _busqueda = '';

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);
    return AlertDialog(
      key: const Key('items_picker'),
      title: const Text('Agregar producto'),
      content: SizedBox(
        width: 360,
        height: 360,
        child: Column(
          children: [
            TextField(
              key: const Key('items_picker_buscar'),
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Buscar',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (valor) => setState(() => _busqueda = valor),
            ),
            const SizedBox(height: 8),
            Expanded(child: _lista(catalogo)),
          ],
        ),
      ),
      actions: [
        TextButton(
          key: const Key('items_picker_cancelar'),
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
      ],
    );
  }

  Widget _lista(AsyncValue<Catalogo> catalogo) {
    if (catalogo.isLoading && !catalogo.hasValue) {
      return const Center(child: CircularProgressIndicator());
    }
    final productos = catalogo.value?.productos;
    if (productos == null) {
      return const Center(
        child: Text('No se pudo cargar el catálogo.', textAlign: TextAlign.center),
      );
    }
    final aguja = _busqueda.trim().toLowerCase();
    final filtrados = productos
        .where((p) =>
            p.activo &&
            !widget.excluidos.contains(p.id) &&
            (aguja.isEmpty ||
                p.nombre.toLowerCase().contains(aguja) ||
                p.alias.any((a) => a.toLowerCase().contains(aguja))))
        .toList();
    if (filtrados.isEmpty) {
      return const Center(child: Text('Sin resultados.'));
    }
    return ListView.builder(
      itemCount: filtrados.length,
      itemBuilder: (context, index) {
        final producto = filtrados[index];
        return ListTile(
          key: Key('items_picker_tile_${producto.id}'),
          title: Text(producto.nombre),
          subtitle: Text('${moneda(producto.precio)} / ${producto.unidadLabel}'),
          onTap: () => Navigator.pop(context, producto),
        );
      },
    );
  }
}
