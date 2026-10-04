import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import 'ajuste_stock_dialog.dart';
import 'producto_form_dialog.dart';

/// Gestión de catálogo del Dueño: alta, edición, baja y ajustes de stock.
/// Usa el catálogo completo: `GET /api/v1/catalogo` incluye inactivos.
class ProductosPane extends ConsumerStatefulWidget {
  const ProductosPane({super.key});

  @override
  ConsumerState<ProductosPane> createState() => _ProductosPaneState();
}

class _ProductosPaneState extends ConsumerState<ProductosPane> {
  String _busqueda = '';

  List<Producto> _filtrar(List<Producto> productos) {
    final texto = _busqueda.trim().toLowerCase();
    if (texto.isEmpty) return productos;
    return productos
        .where((p) =>
            p.nombre.toLowerCase().contains(texto) ||
            p.alias.any((a) => a.toLowerCase().contains(texto)))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);
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
                onPressed: () => mostrarFormProducto(context),
                icon: const Icon(Icons.add),
                label: const Text('Nuevo producto'),
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
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudo cargar el catálogo.'),
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
              return ListView.separated(
                key: const Key('admin_productos_lista'),
                itemCount: productos.length + 1,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  if (index == productos.length) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        productos.length == data.productos.length
                            ? '${productos.length} productos'
                            : '${productos.length} de ${data.productos.length} productos',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    );
                  }
                  return _ProductoAdminTile(producto: productos[index]);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ProductoAdminTile extends StatelessWidget {
  const _ProductoAdminTile({required this.producto});

  final Producto producto;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('admin_producto_${producto.id}'),
      title: Text(producto.nombre),
      subtitle: Text(
        '${moneda(producto.precio)} / ${producto.unidadLabel}'
        ' · Stock: ${cantidadNum(producto.stock)}'
        ' · Mín.: ${cantidadNum(producto.stockMinimo)}',
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!producto.activo)
            const Chip(
              label: Text('Inactivo'),
              visualDensity: VisualDensity.compact,
            )
          else if (producto.stockBajo)
            const Chip(
              label: Text('Stock bajo'),
              visualDensity: VisualDensity.compact,
            ),
          IconButton(
            key: Key('admin_ajustar_${producto.id}'),
            tooltip: 'Ajustar stock',
            onPressed: () => mostrarAjusteStock(context, producto),
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      onTap: () => mostrarFormProducto(context, existente: producto),
    );
  }
}
