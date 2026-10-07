import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../widgets/common.dart';

class StandsScreen extends StatefulWidget {
  const StandsScreen({required this.api, required this.onAdd, super.key});

  final MercadoApi api;
  final void Function({
    required String tenantId,
    required String tenantName,
    required Producto product,
    required DateTime readAt,
    required bool stale,
  })
  onAdd;

  @override
  State<StandsScreen> createState() => _StandsScreenState();
}

class _StandsScreenState extends State<StandsScreen> {
  late Future<List<Puesto>> _standsFuture;
  Puesto? _puesto;
  late Future<ProductRead> _productsFuture;

  @override
  void initState() {
    super.initState();
    _standsFuture = widget.api.listarPuestos();
  }

  void _openStand(Puesto stand) {
    setState(() {
      _puesto = stand;
      _productsFuture = widget.api.products(stand.id);
    });
  }

  Future<void> _refreshProducts() async {
    final puesto = _puesto;
    if (puesto == null) return;
    setState(() {
      _productsFuture = widget.api.products(puesto.id, force: true);
    });
    await _productsFuture;
  }

  @override
  Widget build(BuildContext context) {
    final puesto = _puesto;
    if (puesto != null) {
      return Column(
        children: [
          ListTile(
            leading: IconButton(
              tooltip: 'Volver a los puestos',
              onPressed: () => setState(() => _puesto = null),
              icon: const Icon(Icons.arrow_back),
            ),
            title: Text(puesto.nombre),
            trailing: IconButton(
              tooltip: 'Actualizar productos',
              onPressed: _refreshProducts,
              icon: const Icon(Icons.refresh),
            ),
          ),
          Expanded(
            child: FutureBuilder<ProductRead>(
              future: _productsFuture,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return ErrorPanel(
                    error: snapshot.error,
                    onRetry: _refreshProducts,
                  );
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final result = snapshot.data!;
                return Column(
                  children: [
                    if (result.isStale)
                      MaterialBanner(
                        content: Text(
                          'Sin conexión. Catálogo de ${timeLabel(result.readAt)}. '
                          'No se puede confirmar una compra con estos datos.',
                        ),
                        leading: const Icon(Icons.cloud_off_outlined),
                        actions: [
                          TextButton(
                            onPressed: _refreshProducts,
                            child: const Text('Reintentar'),
                          ),
                        ],
                      ),
                    Expanded(
                      child: result.products.isEmpty
                          ? const Center(
                              child: Text('No hay productos publicados.'),
                            )
                          : RefreshIndicator(
                              onRefresh: _refreshProducts,
                              child: ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                itemCount: result.products.length,
                                itemBuilder: (context, index) {
                                  final product = result.products[index];
                                  return ListTile(
                                    title: Text(product.nombre),
                                    subtitle: Text(
                                      '${money(product.precio)} · '
                                      '${product.unidadLabel} · '
                                      'Disponible: ${quantity(product.disponible)}',
                                    ),
                                    trailing: IconButton.filledTonal(
                                      tooltip: 'Agregar al carrito',
                                      onPressed: product.disponible <= 0
                                          ? null
                                          : () => widget.onAdd(
                                              tenantId: puesto.id,
                                              tenantName: puesto.nombre,
                                              product: product,
                                              readAt: result.readAt,
                                              stale: result.isStale,
                                            ),
                                      icon: const Icon(Icons.add_shopping_cart),
                                    ),
                                  );
                                },
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
    }
    return FutureBuilder<List<Puesto>>(
      future: _standsFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ErrorPanel(
            error: snapshot.error,
            onRetry: () async {
              setState(() {
                _standsFuture = widget.api.listarPuestos(force: true);
              });
              await _standsFuture;
            },
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final stands = snapshot.data!;
        if (stands.isEmpty) {
          return const Center(
            child: Text('Todavía no hay puestos disponibles.'),
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            setState(() {
              _standsFuture = widget.api.listarPuestos(force: true);
            });
            await _standsFuture;
          },
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: stands.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final stand = stands[index];
              return ListTile(
                leading: const CircleAvatar(
                  child: Icon(Icons.storefront_outlined),
                ),
                title: Text(stand.nombre),
                subtitle: Text(
                  stand.bajada.isNotEmpty
                      ? stand.bajada
                      : 'Ver productos disponibles',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _openStand(stand),
              );
            },
          ),
        );
      },
    );
  }
}
