import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/auth/auth_controller.dart';
import '../../models/producto.dart';
import '../../models/staff_session.dart';
import '../../services/catalogo_service.dart';
import '../carrito/carrito_controller.dart';

/// Catálogo compartido por todos los roles. El vendedor además puede agregar
/// productos al carrito; el servidor decide qué ve cada rol.
class CatalogoScreen extends ConsumerWidget {
  const CatalogoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogo = ref.watch(catalogoProvider);
    final rol = ref.watch(authControllerProvider).sesion?.staff.rol;
    final puedeAgregar = rol == Rol.vendedor;
    return catalogo.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => _ErrorCatalogo(
        mensaje:
            error is ApiException ? error.message : 'No se pudo cargar el catálogo.',
        onReintentar: () => ref.invalidate(catalogoProvider),
      ),
      data: (data) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(catalogoProvider);
          try {
            await ref.read(catalogoProvider.future);
          } on ApiException {
            // El rebuild de `catalogo` ya muestra el estado de error.
          }
        },
        child: ListView.separated(
          key: const Key('catalogo_lista'),
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: data.productos.length + 1,
          separatorBuilder: (context, index) => const Divider(height: 1),
          itemBuilder: (context, index) {
            if (index == data.productos.length) {
              return _PieCatalogo(
                cantidad: data.productos.length,
                version: data.version,
              );
            }
            final producto = data.productos[index];
            return _ProductoTile(
              producto: producto,
              onAgregar: puedeAgregar && producto.activo
                  ? () {
                      ref
                          .read(carritoControllerProvider.notifier)
                          .agregar(producto);
                      ScaffoldMessenger.of(context)
                        ..removeCurrentSnackBar()
                        ..showSnackBar(SnackBar(
                          content: Text('${producto.nombre} agregado al carrito'),
                          duration: const Duration(seconds: 1),
                        ));
                    }
                  : null,
            );
          },
        ),
      ),
    );
  }
}

class _ProductoTile extends StatelessWidget {
  const _ProductoTile({required this.producto, this.onAgregar});

  final Producto producto;
  final VoidCallback? onAgregar;

  @override
  Widget build(BuildContext context) {
    final estado = _estado(producto);
    return ListTile(
      key: Key('producto_${producto.id}'),
      enabled: producto.activo,
      title: Text(producto.nombre),
      subtitle: Text(
        '${moneda(producto.precio)} / ${producto.unidadLabel}'
        ' · Stock: ${cantidadNum(producto.stock)} ${producto.unidadLabel}',
      ),
      trailing: (estado == null && onAgregar == null)
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ?estado,
                if (onAgregar != null)
                  IconButton(
                    key: Key('agregar_${producto.id}'),
                    tooltip: 'Agregar al carrito',
                    onPressed: onAgregar,
                    icon: const Icon(Icons.add_circle_outline),
                  ),
              ],
            ),
    );
  }

  Widget? _estado(Producto producto) {
    if (!producto.activo) {
      return const Chip(
        label: Text('Inactivo'),
        visualDensity: VisualDensity.compact,
      );
    }
    if (producto.stockBajo) {
      return const Chip(
        label: Text('Stock bajo'),
        visualDensity: VisualDensity.compact,
      );
    }
    return null;
  }
}

class _PieCatalogo extends StatelessWidget {
  const _PieCatalogo({required this.cantidad, required this.version});

  final int cantidad;
  final String? version;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Text(
        '${cantidad == 1 ? '1 producto' : '$cantidad productos'}'
        ' · versión ${version ?? '—'}',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}

class _ErrorCatalogo extends StatelessWidget {
  const _ErrorCatalogo({required this.mensaje, required this.onReintentar});

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
            key: const Key('catalogo_reintentar'),
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
