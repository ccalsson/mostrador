import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../refresco.dart';
import '../widgets/common.dart';

class StandsScreen extends StatefulWidget {
  const StandsScreen({
    required this.api,
    required this.actor,
    required this.onAdd,
    this.refrescoCada = refrescoPuestos,
    super.key,
  });

  final MercadoApi api;

  /// Los avisos del marketplace se piden sólo con la identidad aprobada que
  /// habilita el checkout, igual que en la web.
  final MercadoActor actor;

  final Duration refrescoCada;

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
  late final Refrescador _refrescador;
  Future<List<Aviso>>? _avisos;
  Puesto? _puesto;
  late Future<ProductRead> _productsFuture;

  @override
  void initState() {
    super.initState();
    _standsFuture = widget.api.listarPuestos();
    if (widget.actor.puedeComprar) _avisos = widget.api.listarAvisos();
    _refrescador = Refrescador(
      intervalo: widget.refrescoCada,
      onRefresco: _refrescarVista,
    );
  }

  @override
  void dispose() {
    _refrescador.detener();
    super.dispose();
  }

  Future<void> _refrescarVista() async {
    if (_puesto == null) {
      await _refreshStands();
    } else {
      await _refreshProducts();
    }
  }

  Future<void> _refreshStands() async {
    setState(() {
      _standsFuture = widget.api.listarPuestos(force: true);
      if (widget.actor.puedeComprar) _avisos = widget.api.listarAvisos();
    });
    await _standsFuture;
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
              onPressed: _refrescador.ejecutar,
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
                              onRefresh: _refrescador.ejecutar,
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
          return ErrorPanel(error: snapshot.error, onRetry: _refreshStands);
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final stands = snapshot.data!;
        return RefreshIndicator(
          onRefresh: _refrescador.ejecutar,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              _avisosHome(),
              if (stands.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Todavía no hay puestos disponibles.'),
                )
              else
                for (var i = 0; i < stands.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    leading: const CircleAvatar(
                      child: Icon(Icons.storefront_outlined),
                    ),
                    title: Text(stands[i].nombre),
                    subtitle: Text(
                      stands[i].bajada.isNotEmpty
                          ? stands[i].bajada
                          : 'Ver productos disponibles',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _openStand(stands[i]),
                  ),
                ],
            ],
          ),
        );
      },
    );
  }

  /// Cards de avisos arriba del listado, como en la web. Si el endpoint
  /// falla, la home de puestos sigue intacta: los avisos se ocultan.
  Widget _avisosHome() => FutureBuilder<List<Aviso>>(
    future: _avisos,
    builder: (context, snapshot) {
      final avisos = snapshot.data;
      if (avisos == null || avisos.isEmpty) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final aviso in avisos)
            Card(
              key: Key('aviso_${aviso.id}'),
              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      aviso.titulo.toUpperCase(),
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    Text(
                      aviso.tenantNombre,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Text(
                      aviso.detalle,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    if (aviso.precio != null)
                      Text(
                        '${money(aviso.precio!)}'
                        '${aviso.unidadLabel != null ? ' / ${aviso.unidadLabel}' : ''}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    Text(
                      'Hasta ${aviso.endsOn}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );
}
