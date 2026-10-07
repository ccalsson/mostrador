import 'package:flutter/material.dart';

import 'market_api.dart';
import 'models.dart';
import 'screens/buyer_orders_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/courier_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/stands_screen.dart';

class MarketHome extends StatefulWidget {
  const MarketHome({
    required this.api,
    required this.actor,
    required this.onSignOut,
    required this.onRefreshActor,
    super.key,
  });

  final MercadoApi api;
  final Map<String, dynamic> actor;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onRefreshActor;

  @override
  State<MarketHome> createState() => _MarketHomeState();
}

class _MarketHomeState extends State<MarketHome> {
  final Map<String, CartLine> _cart = {};
  int _index = 0;

  bool get _isBuyer => widget.actor['perfil'] == 'comprador';

  @override
  Widget build(BuildContext context) {
    final actor = MercadoActor.fromJson(widget.actor);
    final pages = _isBuyer
        ? <Widget>[
            StandsScreen(api: widget.api, onAdd: _addToCart),
            CartScreen(
              api: widget.api,
              actor: actor,
              lines: _cart,
              onQuantityChanged: _setQuantity,
              onRemove: _remove,
              onIdentityNeeded: () => setState(() => _index = 3),
              onCheckout: _checkoutComplete,
            ),
            BuyerOrdersScreen(api: widget.api, actor: actor),
            ProfileScreen(
              api: widget.api,
              actor: widget.actor,
              onRefresh: widget.onRefreshActor,
            ),
          ]
        : <Widget>[
            CourierScreen(api: widget.api, actor: widget.actor),
            ProfileScreen(
              api: widget.api,
              actor: widget.actor,
              onRefresh: widget.onRefreshActor,
            ),
          ];
    final labels = _isBuyer
        ? const ['Puestos', 'Carrito', 'Pedidos', 'Perfil']
        : const ['Recorridos', 'Perfil'];
    final icons = _isBuyer
        ? const [
            Icons.storefront_outlined,
            Icons.shopping_cart_outlined,
            Icons.receipt_long_outlined,
            Icons.person_outline,
          ]
        : const [Icons.route_outlined, Icons.person_outline];
    final titles = _isBuyer
        ? const ['Puestos', 'Carrito', 'Mis pedidos', 'Mi perfil']
        : const ['Mis recorridos', 'Mi perfil'];
    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_index]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: Text(_isBuyer ? 'Comprador' : 'Cargador')),
          ),
          IconButton(
            tooltip: 'Cerrar sesión',
            onPressed: () async {
              await widget.onSignOut();
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: [
          for (var i = 0; i < labels.length; i++)
            NavigationDestination(icon: Icon(icons[i]), label: labels[i]),
        ],
      ),
    );
  }

  void _addToCart({
    required String tenantId,
    required String tenantName,
    required Producto product,
    required DateTime readAt,
    required bool stale,
  }) {
    final id = '$tenantId::${product.id}';
    final previous = _cart[id];
    setState(() {
      _cart[id] = CartLine(
        tenantId: tenantId,
        tenantName: tenantName,
        product: product,
        quantity: (previous?.quantity ?? 0) + 1,
        readAt: readAt,
        stale: stale,
      );
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${product.nombre} agregado al carrito.')),
    );
  }

  void _setQuantity(String id, double quantity) {
    if (quantity <= 0) {
      _remove(id);
      return;
    }
    final line = _cart[id];
    if (line == null) return;
    setState(() => _cart[id] = line.copyWith(quantity: quantity));
  }

  void _remove(String id) => setState(() => _cart.remove(id));

  void _checkoutComplete(Map<String, dynamic> result) {
    final orders = PedidoComprador.listFromJson(result['pedidos']);
    setState(() {
      _cart.clear();
      _index = 2;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '${orders.length} pedido(s) confirmado(s) por el servidor.',
        ),
      ),
    );
  }
}
