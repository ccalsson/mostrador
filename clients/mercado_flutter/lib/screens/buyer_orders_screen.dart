import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../widgets/common.dart';
import 'order_detail_screen.dart';

class BuyerOrdersScreen extends StatefulWidget {
  const BuyerOrdersScreen({required this.api, required this.actor, super.key});

  final MercadoApi api;
  final MercadoActor actor;

  @override
  State<BuyerOrdersScreen> createState() => _BuyerOrdersScreenState();
}

class _BuyerOrdersScreenState extends State<BuyerOrdersScreen> {
  late Future<List<PedidoComprador>> _orders;
  late Future<List<Recorrido>> _routes;
  final Set<String> _selected = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _orders = widget.api.listarPedidosComprador();
    _routes = widget.api.listarRecorridos();
  }

  Future<void> _refresh() async {
    setState(_reload);
    await Future.wait([_orders, _routes]);
  }

  void _openOrder(PedidoComprador order) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderDetailScreen(api: widget.api, pedidoId: order.id),
      ),
    );
    if (mounted) _refresh();
  }

  Future<void> _assignCourier() async {
    final couriers = await widget.api.listarCargadores();
    if (!mounted) return;
    final chosen = await showModalBottomSheet<Cargador>(
      context: context,
      builder: (context) => SafeArea(
        child: couriers.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No hay cargadores disponibles en este momento.'),
              )
            : ListView(
                shrinkWrap: true,
                children: [
                  const ListTile(title: Text('Elegí un cargador')),
                  for (final courier in couriers)
                    ListTile(
                      leading: const CircleAvatar(
                        child: Icon(Icons.delivery_dining),
                      ),
                      title: Text(courier.nombre),
                      subtitle: Text(
                        '${courier.nivel} · ${courier.puntos} puntos · '
                        '⭐ ${courier.calificacion.toStringAsFixed(1)}',
                      ),
                      onTap: () => Navigator.pop(context, courier),
                    ),
                ],
              ),
      ),
    );
    if (chosen == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await widget.api.crearRecorrido(
        userId: widget.actor.id,
        courierId: chosen.id,
        orderIds: _selected.toList(),
      );
      if (mounted) {
        setState(() {
          _selected.clear();
          _reload();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Recorrido asignado al cargador.')),
        );
      }
    } on MercadoApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rate(Recorrido route) async {
    var stars = 5;
    final comment = TextEditingController();
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, updateDialog) => AlertDialog(
          title: const Text('Calificá al cargador'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                initialValue: stars,
                decoration: const InputDecoration(labelText: 'Estrellas'),
                items: [
                  for (var i = 1; i <= 5; i++)
                    DropdownMenuItem(value: i, child: Text('$i')),
                ],
                onChanged: (value) => updateDialog(() => stars = value ?? 5),
              ),
              TextField(
                controller: comment,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Comentario (opcional)',
                ),
                maxLines: 3,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Enviar'),
            ),
          ],
        ),
      ),
    );
    if (submit != true || !mounted) return;
    try {
      await widget.api.calificarRecorrido(
        routeId: route.id,
        stars: stars,
        comment: comment.text,
      );
      if (mounted) setState(_reload);
    } on MercadoApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      comment.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<PedidoComprador>>(
    future: _orders,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return ErrorPanel(error: snapshot.error, onRetry: _refresh);
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final orders = snapshot.data!;
      final ready = orders
          .where((order) => order.estado == EstadoPedidoComprador.preparado)
          .toList();
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (ready.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text('Preparados para retiro'),
              ),
              for (final order in ready)
                CheckboxListTile(
                  value: _selected.contains(order.id),
                  onChanged: (selected) => setState(() {
                    if (selected == true) {
                      _selected.add(order.id);
                    } else {
                      _selected.remove(order.id);
                    }
                  }),
                  title: Text(order.puesto),
                  subtitle: Text(
                    '${quantity(order.bultos)} bultos · ${money(order.total)}',
                  ),
                  secondary: const Icon(Icons.inventory_2_outlined),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: FilledButton.icon(
                  onPressed: _busy || _selected.isEmpty ? null : _assignCourier,
                  icon: const Icon(Icons.delivery_dining),
                  label: const Text('Armar recorrido con estos pedidos'),
                ),
              ),
            ],
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text('Pedidos por puesto'),
            ),
            if (orders.isEmpty)
              const ListTile(title: Text('Todavía no tenés pedidos.')),
            for (final order in orders)
              ListTile(
                leading: const Icon(Icons.receipt_long_outlined),
                title: Text(order.puesto),
                subtitle: Text(
                  '${order.estado.label} · ${quantity(order.bultos)} bultos',
                ),
                trailing: Text(money(order.total)),
                onTap: () => _openOrder(order),
              ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text('Recorridos'),
            ),
            FutureBuilder<List<Recorrido>>(
              future: _routes,
              builder: (context, routeSnapshot) {
                if (routeSnapshot.hasError) {
                  return ErrorPanel(
                    error: routeSnapshot.error,
                    onRetry: _refresh,
                  );
                }
                if (!routeSnapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final routes = routeSnapshot.data!;
                if (routes.isEmpty) {
                  return const ListTile(
                    title: Text('No hay recorridos todavía.'),
                  );
                }
                return Column(
                  children: [
                    for (final route in routes)
                      Card(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.route_outlined),
                              title: Text('Cargador: ${route.cargador}'),
                              subtitle: Text(
                                '${route.estado.label} · '
                                '${quantity(route.bultos)} bultos',
                              ),
                            ),
                            for (final stop in route.paradas)
                              ListTile(
                                dense: true,
                                title: Text(stop.puesto),
                                subtitle: Text(
                                  '${stop.estado.label} · '
                                  '${quantity(stop.bultos)} bultos',
                                ),
                              ),
                            if (route.estado == EstadoRecorrido.entregado &&
                                !route.calificada)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: OutlinedButton.icon(
                                  onPressed: () => _rate(route),
                                  icon: const Icon(Icons.star_outline),
                                  label: const Text('Calificar recorrido'),
                                ),
                              ),
                            if (route.calificada)
                              const Padding(
                                padding: EdgeInsets.only(bottom: 12),
                                child: Text('Recorrido calificado'),
                              ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      );
    },
  );
}
