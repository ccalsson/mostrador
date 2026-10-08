import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/tema.dart';
import '../../core/widgets/titulo_seccion.dart';
import '../../models/staff_session.dart';
import '../../services/catalogo_service.dart';
import '../../services/tenant_service.dart';
import '../admin/alertas_pane.dart';
import '../admin/auditoria_pane.dart';
import '../admin/clientes_pane.dart';
import '../admin/dashboard_pane.dart';
import '../admin/productos_pane.dart';
import '../admin/remitos_pane.dart';
import '../admin/suscripcion_pane.dart';
import '../admin/usuarios_pane.dart';
import '../caja/caja_pane.dart';
import '../catalog/catalogo_screen.dart';
import '../carrito/carrito_pane.dart';
import '../pedidos/pedidos_pane.dart';

/// Shell del puesto: barra superior leaf-2 con la identidad del tenant y un
/// menú horizontal de píldoras para las secciones del rol (común a Android y
/// Windows). El vendedor suma Carrito y Pedidos; el cajero suma Caja; el
/// Dueño suma Productos, Alertas, Usuarios, Clientes, Remitos, Auditoría y
/// Suscripción.
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

const _destinoDashboard =
    _Destino(Icons.dashboard_outlined, Icons.dashboard, 'Dashboard');
const _destinoCatalogo =
    _Destino(Icons.inventory_2_outlined, Icons.inventory_2, 'Catálogo');
const _destinoCarrito =
    _Destino(Icons.shopping_cart_outlined, Icons.shopping_cart, 'Carrito');
const _destinoPedidos =
    _Destino(Icons.receipt_long_outlined, Icons.receipt_long, 'Pedidos');
const _destinoCaja =
    _Destino(Icons.point_of_sale_outlined, Icons.point_of_sale, 'Caja');
const _destinoProductos =
    _Destino(Icons.category_outlined, Icons.category, 'Productos');
const _destinoAlertas =
    _Destino(Icons.notifications_outlined, Icons.notifications, 'Alertas');
const _destinoUsuarios =
    _Destino(Icons.people_outlined, Icons.people, 'Usuarios');
const _destinoClientes =
    _Destino(Icons.storefront_outlined, Icons.storefront, 'Clientes');
const _destinoRemitos =
    _Destino(Icons.local_shipping_outlined, Icons.local_shipping, 'Remitos');
const _destinoAuditoria =
    _Destino(Icons.history_outlined, Icons.history, 'Auditoría');
const _destinoSuscripcion = _Destino(
    Icons.workspace_premium_outlined, Icons.workspace_premium, 'Suscripción');
const _destinoSesion =
    _Destino(Icons.badge_outlined, Icons.badge, 'Sesión');

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  int _destino = 0;

  void _seleccionar(int indice) => setState(() => _destino = indice);

  List<_Destino> get _destinos => switch (widget.rol) {
        Rol.vendedor => const [
            _destinoCatalogo,
            _destinoCarrito,
            _destinoPedidos,
            _destinoSesion,
          ],
        Rol.cajero => const [_destinoCatalogo, _destinoCaja, _destinoSesion],
        Rol.admin => const [
            _destinoDashboard,
            _destinoCatalogo,
            _destinoProductos,
            _destinoAlertas,
            _destinoUsuarios,
            _destinoClientes,
            _destinoRemitos,
            _destinoAuditoria,
            _destinoSuscripcion,
            _destinoSesion,
          ],
      };

  Widget _pantalla() {
    return switch ((widget.rol, _destino)) {
      (Rol.admin, 0) => const DashboardPane(),
      (_, 0) when widget.rol != Rol.admin => const CatalogoScreen(),
      (Rol.admin, 1) => const CatalogoScreen(),
      (Rol.vendedor, 1) => const CarritoPane(),
      (Rol.vendedor, 2) => const PedidosPane(),
      (Rol.cajero, 1) => const CajaPane(),
      (Rol.admin, 2) => const ProductosPane(),
      (Rol.admin, 3) => const AlertasPane(),
      (Rol.admin, 4) => const UsuariosPane(),
      (Rol.admin, 5) => const ClientesPane(),
      (Rol.admin, 6) => const RemitosPane(),
      (Rol.admin, 7) => const AuditoriaPane(),
      (Rol.admin, 8) => const SuscripcionPane(),
      _ => const _SesionPane(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final sesion = ref.watch(authControllerProvider).sesion;
    final tokens = context.tokens;
    final theme = Theme.of(context);
    final tenant =
        ref.watch(tenantProvider).value ?? const IdentidadTenant(nombre: 'Mostrador', bajada: '');
    final destinoActual = _destinos[_destino];
    final oscuro = theme.brightness == Brightness.dark;
    // En pantallas angostas el chip de rol y el nombre no entran y duplican
    // las etiquetas del NavigationBar; el rol ya queda implícito en el menú.
    final barraCompleta = MediaQuery.sizeOf(context).width >= 600;

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: tokens.leaf2,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Text(
                  'Mostrador',
                  style: theme.textTheme.titleLarge?.copyWith(color: tokens.leafFg),
                ),
                if (tenant.bajada.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 3,
                    child: Text(
                      tenant.bajada,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(color: tokens.ambar),
                    ),
                  ),
                ],
                const Spacer(),
                if (barraCompleta) ...[
                  _ChipRol(texto: widget.rol.label),
                  if (sesion != null) ...[
                    const SizedBox(width: 10),
                    Text(
                      sesion.staff.nombre,
                      style:
                          theme.textTheme.bodySmall?.copyWith(color: tokens.leafFg),
                    ),
                  ],
                ],
                IconButton(
                  key: const Key('refresh_button'),
                  tooltip: 'Actualizar catálogo',
                  color: tokens.leafFg,
                  onPressed: () => ref.invalidate(catalogoProvider),
                  icon: const Icon(Icons.refresh),
                ),
                IconButton(
                  key: const Key('logout_button'),
                  tooltip: 'Cerrar sesión',
                  color: tokens.leafFg,
                  onPressed: () =>
                      ref.read(authControllerProvider.notifier).logout(),
                  icon: const Icon(Icons.logout),
                ),
                IconButton(
                  key: const Key('btn_tema'),
                  tooltip: 'Cambiar tema',
                  color: tokens.leafFg,
                  onPressed: () =>
                      ref.read(temaControllerProvider.notifier).alternar(),
                  icon: Icon(oscuro ? Icons.light_mode : Icons.dark_mode),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              children: [
                for (final (indice, destino) in _destinos.indexed)
                  _Pildora(
                    etiqueta: destino.etiqueta,
                    icono: indice == _destino ? destino.iconoActivo : destino.icono,
                    activa: indice == _destino,
                    onTap: () => _seleccionar(indice),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: TituloSeccion(destinoActual.etiqueta),
          ),
          // Columna de contenido: en ventanas anchas las filas estiradas al
          // ancho total quedan ilegibles, así que el contenido se centra con
          // un tope; en pantallas angostas ocupa el ancho disponible.
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1080),
                child: _pantalla(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChipRol extends StatelessWidget {
  const _ChipRol({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: tokens.terra,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        texto,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: tokens.leafFg,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

class _Pildora extends StatelessWidget {
  const _Pildora({
    required this.etiqueta,
    required this.icono,
    required this.activa,
    required this.onTap,
  });

  final String etiqueta;
  final IconData icono;
  final bool activa;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: activa ? tokens.terra : tokens.surface,
        shape: StadiumBorder(
          side: BorderSide(color: activa ? tokens.terra : tokens.line),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icono,
                  size: 16,
                  color: activa ? tokens.leafFg : tokens.muted,
                ),
                const SizedBox(width: 6),
                Text(
                  etiqueta,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: activa ? tokens.leafFg : tokens.inkSoft,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
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
