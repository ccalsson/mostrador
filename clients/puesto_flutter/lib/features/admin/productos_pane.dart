import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import '../../services/productos_service.dart';
import 'ajuste_stock_dialog.dart';
import 'foto_producto_widget.dart';
import 'producto_form_controller.dart';
import 'producto_form_dialog.dart';

/// Gestión de catálogo del Dueño: alta, edición, baja y ajustes de stock.
class ProductosPane extends ConsumerStatefulWidget {
  const ProductosPane({super.key});

  @override
  ConsumerState<ProductosPane> createState() => _ProductosPaneState();
}

class _ProductosPaneState extends ConsumerState<ProductosPane> {
  Producto? _seleccionado;
  bool _modoNuevo = false;
  String _busqueda = '';

  final _nombre = TextEditingController();
  final _unidadLabel = TextEditingController();
  final _precio = TextEditingController();
  final _minimo = TextEditingController();
  final _alias = TextEditingController();
  final _inicial = TextEditingController();
  String _unidad = 'kg';
  bool _activo = true;
  bool _publicadoOnline = false;
  String? _validacion;

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

  List<Producto> _filtrar(List<Producto> productos) {
    final texto = _busqueda.trim().toLowerCase();
    if (texto.isEmpty) return productos;
    return productos
        .where(
          (p) =>
              p.nombre.toLowerCase().contains(texto) ||
              p.alias.any((a) => a.toLowerCase().contains(texto)),
        )
        .toList();
  }

  void _seleccionar(Producto producto) {
    ref.read(productoFormProvider.notifier).reiniciar();
    setState(() {
      _seleccionado = producto;
      _modoNuevo = false;
      _cargarForm(producto);
    });
  }

  void _nuevo() {
    ref.read(productoFormProvider.notifier).reiniciar();
    setState(() {
      _seleccionado = null;
      _modoNuevo = true;
      _limpiarForm();
    });
  }

  void _cancelar() {
    ref.read(productoFormProvider.notifier).reiniciar();
    setState(() {
      _seleccionado = null;
      _modoNuevo = false;
      _limpiarForm();
    });
  }

  void _cargarForm(Producto producto) {
    _nombre.text = producto.nombre;
    _unidadLabel.text = producto.unidadLabel;
    _precio.text = cantidadNum(producto.precio);
    _minimo.text = cantidadNum(producto.stockMinimo);
    _alias.text = producto.alias.join(', ');
    _inicial.clear();
    _unidad = producto.unidad;
    _activo = producto.activo;
    _publicadoOnline = producto.publicadoOnline;
    _validacion = null;
  }

  void _limpiarForm() {
    _nombre.clear();
    _unidadLabel.text = 'kg';
    _precio.clear();
    _minimo.clear();
    _alias.clear();
    _inicial.clear();
    _unidad = 'kg';
    _activo = true;
    _publicadoOnline = false;
    _validacion = null;
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
        () => _validacion = 'Etiqueta de unidad requerida (máx. 20).',
      );
    }
    if (precio == null || precio <= 0) {
      return setState(() => _validacion = 'Precio inválido.');
    }
    if (minimo == null || minimo < 0) {
      return setState(() => _validacion = 'Stock mínimo inválido.');
    }

    double? inicial;
    final textoInicial = _inicial.text.trim();
    if (_seleccionado == null && textoInicial.isNotEmpty) {
      inicial = parseDecimal(textoInicial);
      if (inicial == null) {
        return setState(() => _validacion = 'Stock inicial inválido.');
      }
    }

    setState(() => _validacion = null);
    final ok = await ref
        .read(productoFormProvider.notifier)
        .guardar(
          ProductoInput(
            id: _seleccionado?.id,
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
            publicadoOnline: _publicadoOnline,
            stockInicial: inicial,
          ),
        );

    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _seleccionado == null ? 'Producto creado.' : 'Producto actualizado.',
        ),
      ),
    );
    if (_seleccionado == null) {
      setState(_limpiarForm);
    }
  }

  Future<void> _bajar() async {
    if (_seleccionado == null) return;
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dar de baja'),
        content: Text(
          '¿Dar de baja "${_seleccionado!.nombre}"? Podés reactivarlo después editándolo.',
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
    final ok = await ref
        .read(productoFormProvider.notifier)
        .bajar(_seleccionado!.id);
    if (ok && mounted) {
      setState(() {
        _seleccionado = null;
        _modoNuevo = false;
        _limpiarForm();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);
    final estado = ref.watch(productoFormProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final inline = constraints.maxWidth >= 800;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('admin_buscar_producto'),
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search),
                        hintText: 'Buscar por nombre o alias',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) => setState(() => _busqueda = value),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    key: const Key('admin_nuevo_producto'),
                    onPressed: estado.enviando
                        ? null
                        : () {
                            if (inline) {
                              _nuevo();
                            } else {
                              mostrarFormProducto(context);
                            }
                          },
                    icon: const Icon(Icons.add),
                    label: Text(inline ? 'Nuevo producto' : 'Nuevo'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: catalogo.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        error is ApiException
                            ? error.message
                            : 'No se pudo cargar el catálogo.',
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        key: const Key('admin_productos_reintentar'),
                        onPressed: () => ref.invalidate(catalogoProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (data) {
                  final productos = _filtrar(data.productos);
                  return Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: productos.isEmpty
                            ? const Center(
                                child: Text(
                                  'No hay productos.',
                                  key: Key('admin_productos_vacia'),
                                ),
                              )
                            : ListView.separated(
                                key: const Key('admin_productos_lista'),
                                itemCount: productos.length,
                                separatorBuilder: (_, _) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  final producto = productos[index];
                                  final seleccionado =
                                      _seleccionado?.id == producto.id;
                                  return _ProductoTile(
                                    producto: producto,
                                    seleccionado: inline && seleccionado,
                                    onTap: estado.enviando
                                        ? null
                                        : () {
                                            if (inline) {
                                              _seleccionar(producto);
                                            } else {
                                              mostrarFormProducto(
                                                context,
                                                existente: producto,
                                              );
                                            }
                                          },
                                    onAjustar: () =>
                                        mostrarAjusteStock(context, producto),
                                  );
                                },
                              ),
                      ),
                      if (inline && (_seleccionado != null || _modoNuevo))
                        Expanded(
                          flex: 3,
                          child: Material(
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerLowest,
                            child: Container(
                              decoration: BoxDecoration(
                                border: Border(
                                  left: BorderSide(
                                    color: Theme.of(context).dividerColor,
                                  ),
                                ),
                              ),
                              child: _FormPanel(
                                key: ValueKey(_seleccionado?.id),
                                nombreController: _nombre,
                                unidadLabelController: _unidadLabel,
                                precioController: _precio,
                                minimoController: _minimo,
                                aliasController: _alias,
                                inicialController: _inicial,
                                unidad: _unidad,
                                onUnidadChanged: (v) =>
                                    setState(() => _unidad = v ?? 'kg'),
                                activo: _activo,
                                onActivoChanged: (v) =>
                                    setState(() => _activo = v),
                                publicadoOnline: _publicadoOnline,
                                onPublicadoChanged: (v) =>
                                    setState(() => _publicadoOnline = v),
                                modoNuevo: _modoNuevo,
                                validacion: _validacion,
                                enviando: estado.enviando,
                                errorMensaje:
                                    _validacion ?? estado.errorMensaje,
                                onGuardar: _guardar,
                                onBajar: _seleccionado != null ? _bajar : null,
                                onCancelar: _cancelar,
                                productoId: _seleccionado?.id,
                                fotoUrl: _seleccionado?.fotoUrl,
                                onFotoUpload: (bytes, nombre, mime) async {
                                  if (_seleccionado == null) return;
                                  await ref.read(productoFormProvider.notifier).subirFoto(
                                        productoId: _seleccionado!.id,
                                        bytes: bytes,
                                        nombreArchivo: nombre,
                                        mimeType: mime,
                                      );
                                  if (mounted) setState(() {});
                                },
                                onFotoDelete: () async {
                                  if (_seleccionado == null) return;
                                  await ref.read(productoFormProvider.notifier).borrarFoto(_seleccionado!.id);
                                  if (mounted) setState(() {});
                                },
                              ),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ProductoTile extends StatelessWidget {
  const _ProductoTile({
    required this.producto,
    required this.seleccionado,
    required this.onTap,
    required this.onAjustar,
  });

  final Producto producto;
  final bool seleccionado;
  final VoidCallback? onTap;
  final VoidCallback onAjustar;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('admin_producto_${producto.id}'),
      tileColor: seleccionado
          ? Theme.of(context).colorScheme.primaryContainer
                .withValues(alpha: 0.3)
          : null,
      leading: _Thumbnail(url: producto.fotoUrl),
      title: Text(
        producto.nombre,
        style: TextStyle(fontWeight: seleccionado ? FontWeight.w600 : null),
      ),
      subtitle: Text(
        '${moneda(producto.precio)} / ${producto.unidadLabel}'
        ' · Stock: ${cantidadNum(producto.stock)}'
        ' · Mín.: ${cantidadNum(producto.stockMinimo)}'
        '\nMercado: ${producto.publicadoOnline ? 'publicación activada' : 'sin publicar'}',
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!producto.activo)
            Chip(
              label: const Text('Inactivo'),
              visualDensity: VisualDensity.compact,
              backgroundColor: Theme.of(context).colorScheme.errorContainer,
            )
          else if (producto.stockBajo)
            Chip(
              label: const Text('Stock bajo'),
              visualDensity: VisualDensity.compact,
              backgroundColor: Theme.of(context).colorScheme.tertiaryContainer,
            ),
          IconButton(
            key: Key('admin_ajustar_${producto.id}'),
            tooltip: 'Ajustar stock',
            onPressed: onAjustar,
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      onTap: onTap,
    );
  }
}

/// Thumbnail cuadrado con bordes redondeados para la foto del producto.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fullUrl = url != null ? '${AppConfig.apiBaseUrl}$url' : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        width: 44,
        height: 44,
        child: fullUrl != null
            ? Image.network(
                fullUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(
                  color: cs.surfaceContainerHighest,
                  child: Icon(Icons.broken_image, size: 20, color: cs.onSurfaceVariant),
                ),
                loadingBuilder: (ctx, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    color: cs.surfaceContainerHighest,
                    child: const Center(
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  );
                },
              )
            : Container(
                color: cs.surfaceContainerHighest,
                child: Icon(
                  Icons.photo_library_outlined,
                  size: 20,
                  color: cs.onSurfaceVariant,
                ),
              ),
      ),
    );
  }
}

class _FormPanel extends StatelessWidget {
  const _FormPanel({
    super.key,
    required this.nombreController,
    required this.unidadLabelController,
    required this.precioController,
    required this.minimoController,
    required this.aliasController,
    required this.inicialController,
    required this.unidad,
    required this.onUnidadChanged,
    required this.activo,
    required this.onActivoChanged,
    required this.publicadoOnline,
    required this.onPublicadoChanged,
    required this.modoNuevo,
    required this.validacion,
    required this.enviando,
    required this.errorMensaje,
    required this.onGuardar,
    required this.onBajar,
    required this.onCancelar,
    this.productoId,
    this.fotoUrl,
    required this.onFotoUpload,
    required this.onFotoDelete,
  });

  final TextEditingController nombreController;
  final TextEditingController unidadLabelController;
  final TextEditingController precioController;
  final TextEditingController minimoController;
  final TextEditingController aliasController;
  final TextEditingController inicialController;
  final String unidad;
  final ValueChanged<String?> onUnidadChanged;
  final bool activo;
  final ValueChanged<bool> onActivoChanged;
  final bool publicadoOnline;
  final ValueChanged<bool> onPublicadoChanged;
  final bool modoNuevo;
  final String? validacion;
  final bool enviando;
  final String? errorMensaje;
  final VoidCallback onGuardar;
  final VoidCallback? onBajar;
  final VoidCallback onCancelar;
  final String? productoId;
  final String? fotoUrl;
  final Future<void> Function(Uint8List bytes, String nombre, String mime) onFotoUpload;
  final Future<void> Function() onFotoDelete;

  @override
  Widget build(BuildContext context) {
    final error = validacion ?? errorMensaje;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              modoNuevo ? 'Nuevo producto' : 'Editar producto',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('admin_producto_nombre'),
              controller: nombreController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Nombre',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    key: const Key('admin_producto_unidad_label'),
                    controller: unidadLabelController,
                    decoration: const InputDecoration(
                      labelText: 'Etiqueta de unidad',
                      hintText: 'kg, un, etc.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: const Key('admin_producto_unidad'),
                    initialValue: unidad,
                    decoration: const InputDecoration(
                      labelText: 'Unidad',
                      border: OutlineInputBorder(),
                    ),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(value: 'kg', child: Text('kg')),
                      DropdownMenuItem(value: 'bulto', child: Text('bulto')),
                    ],
                    onChanged: onUnidadChanged,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_producto_precio'),
              controller: precioController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Precio',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_producto_minimo'),
              controller: minimoController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Stock mínimo',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('admin_producto_alias'),
              controller: aliasController,
              decoration: const InputDecoration(
                labelText: 'Alias (separados por coma)',
                hintText: 'alba, albahaca',
                border: OutlineInputBorder(),
              ),
            ),
            if (modoNuevo) ...[
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_producto_inicial'),
                controller: inicialController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Stock inicial',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            const SizedBox(height: 12),
            SwitchListTile(
              key: const Key('admin_producto_activo'),
              title: const Text('Activo'),
              value: activo,
              onChanged: onActivoChanged,
            ),
            SwitchListTile(
              key: const Key('admin_producto_publicado'),
              title: const Text('Publicar en Mercado'),
              subtitle: const Text(
                'Requiere Presencia o Pro y el canal Mercado habilitado.',
              ),
              value: publicadoOnline,
              onChanged: enviando ? null : onPublicadoChanged,
            ),
            if (!modoNuevo && productoId != null) ...[
              const SizedBox(height: 12),
              FotoProductoWidget(
                key: const Key('admin_producto_foto'),
                productoId: productoId,
                fotoUrl: fotoUrl,
                enabled: !enviando,
                onUpload: onFotoUpload,
                onDelete: onFotoDelete,
              ),
            ],
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error,
                key: const Key('admin_producto_error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                if (onBajar != null)
                  TextButton(
                    key: const Key('admin_producto_bajar'),
                    onPressed: enviando ? null : onBajar,
                    child: const Text('Dar de baja'),
                  ),
                const Spacer(),
                TextButton(
                  key: const Key('admin_producto_cancelar'),
                  onPressed: enviando ? null : onCancelar,
                  child: const Text('Cancelar'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  key: const Key('admin_producto_guardar'),
                  onPressed: enviando ? null : onGuardar,
                  child: enviando
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
        ),
      ),
    );
  }
}
