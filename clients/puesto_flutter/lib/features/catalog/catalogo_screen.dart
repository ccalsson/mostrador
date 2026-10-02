import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';

/// Catálogo read-only (primer vertical slice). El servidor decide qué ve cada
/// rol; acá sólo se muestra.
class CatalogoScreen extends ConsumerWidget {
  const CatalogoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogo = ref.watch(catalogoProvider);
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
            return _ProductoTile(producto: data.productos[index]);
          },
        ),
      ),
    );
  }
}

class _ProductoTile extends StatelessWidget {
  const _ProductoTile({required this.producto});

  final Producto producto;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: Key('producto_${producto.id}'),
      enabled: producto.activo,
      title: Text(producto.nombre),
      subtitle: Text(
        '${_moneda(producto.precio)} / ${producto.unidadLabel}'
        ' · Stock: ${_cantidad(producto.stock)} ${producto.unidadLabel}',
      ),
      trailing: _estado(producto),
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

String _moneda(double valor) =>
    '\$${valor.toStringAsFixed(2).replaceAll('.', ',')}';

String _cantidad(double valor) {
  final redondeado = valor.roundToDouble();
  if (redondeado == valor) return redondeado.toStringAsFixed(0);
  return valor.toStringAsFixed(2).replaceAll('.', ',');
}
