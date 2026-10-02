import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../models/staff_session.dart';
import '../../services/catalogo_service.dart';
import '../catalog/catalogo_screen.dart';
import '../carrito/carrito_pane.dart';
import '../pedidos/pedidos_pane.dart';

/// Shell adaptativo por plataforma: navegación inferior en Android,
/// riel lateral en Windows. El vendedor suma Carrito y Pedidos; Caja y
/// Dueño mantienen Catálogo y Sesión.
class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({super.key, required this.rol});

  final Rol rol;

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _Destino {
  const _Destino(this.icono, this.iconoActivo, this.etiqueta);

  final IconData icono;
  final IconData iconoActivo;
  final String etiqueta;
}

const _destinoCatalogo =
    _Destino(Icons.inventory_2_outlined, Icons.inventory_2, 'Catálogo');
const _destinoCarrito =
    _Destino(Icons.shopping_cart_outlined, Icons.shopping_cart, 'Carrito');
const _destinoPedidos =
    _Destino(Icons.receipt_long_outlined, Icons.receipt_long, 'Pedidos');
const _destinoSesion =
    _Destino(Icons.badge_outlined, Icons.badge, 'Sesión');

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  int _destino = 0;

  void _seleccionar(int indice) => setState(() => _destino = indice);

  List<_Destino> get _destinos => widget.rol == Rol.vendedor
      ? const [_destinoCatalogo, _destinoCarrito, _destinoPedidos, _destinoSesion]
      : const [_destinoCatalogo, _destinoSesion];

  Widget _pantalla() {
    final esVendedor = widget.rol == Rol.vendedor;
    return switch (_destino) {
      0 => const CatalogoScreen(),
      1 when esVendedor => const CarritoPane(),
      2 when esVendedor => const PedidosPane(),
      _ => const _SesionPane(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final sesion = ref.watch(authControllerProvider).sesion;
    final destinos = _destinos;
    final plataforma = Theme.of(context).platform;
    final esMovil = plataforma == TargetPlatform.android ||
        plataforma == TargetPlatform.iOS;

    return Scaffold(
      appBar: AppBar(
        title: Text('Mostrador · ${widget.rol.label}'),
        actions: [
          if (sesion != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(sesion.staff.nombre),
              ),
            ),
          IconButton(
            key: const Key('refresh_button'),
            tooltip: 'Actualizar catálogo',
            onPressed: () => ref.invalidate(catalogoProvider),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            key: const Key('logout_button'),
            tooltip: 'Cerrar sesión',
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: esMovil
          ? _pantalla()
          : Row(
              children: [
                NavigationRail(
                  selectedIndex: _destino,
                  onDestinationSelected: _seleccionar,
                  labelType: NavigationRailLabelType.all,
                  destinations: [
                    for (final d in destinos)
                      NavigationRailDestination(
                        icon: Icon(d.icono),
                        selectedIcon: Icon(d.iconoActivo),
                        label: Text(d.etiqueta),
                      ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: _pantalla()),
              ],
            ),
      bottomNavigationBar: esMovil
          ? NavigationBar(
              selectedIndex: _destino,
              onDestinationSelected: _seleccionar,
              destinations: [
                for (final d in destinos)
                  NavigationDestination(
                    icon: Icon(d.icono),
                    selectedIcon: Icon(d.iconoActivo),
                    label: d.etiqueta,
                  ),
              ],
            )
          : null,
    );
  }
}

class _SesionPane extends ConsumerWidget {
  const _SesionPane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sesion = ref.watch(authControllerProvider).sesion;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          leading: const Icon(Icons.badge_outlined),
          title: Text(sesion?.staff.nombre ?? '—'),
          subtitle: Text('Rol: ${sesion?.staff.rol.label ?? '—'}'),
        ),
      ],
    );
  }
}
