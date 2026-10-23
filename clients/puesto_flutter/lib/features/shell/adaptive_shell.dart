import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/tema.dart';
import '../../core/widgets/public_links.dart';
import '../../models/staff_session.dart';
import '../../services/catalogo_service.dart';
import '../../services/suscripcion_service.dart';
import '../../services/tenant_service.dart';
import '../admin/alertas_pane.dart';
import '../admin/auditoria_pane.dart';
import '../admin/clientes_pane.dart';
import '../admin/dashboard_pane.dart';
import '../admin/escritorio_pane.dart';
import '../admin/facturacion_pane.dart';
import '../admin/identidad_pane.dart';
import '../admin/qr_pane.dart';
import '../admin/productos_pane.dart';
import '../admin/proveedores_pane.dart';
import '../admin/remitos_pane.dart';
import '../admin/reportes_pane.dart';
import '../admin/reposicion_pane.dart';
import '../admin/suscripcion_pane.dart';
import '../admin/sucursales_pane.dart';
import '../admin/usuarios_pane.dart';
import '../caja/caja_pane.dart';
import '../catalog/catalogo_screen.dart';
import '../carrito/carrito_pane.dart';
import '../pedidos/pedidos_pane.dart';
import 'mesa_turno_widget.dart';

/// Shell del puesto con navegación lateral agrupada (replica la web).
///
/// En ventanas anchas (>= 900 px) muestra un sidebar fijo de 260 px con los
/// grupos de la web (Operación, Catálogo, Administración, Informes). En
/// ventanas angostas colapsa a un [NavigationDrawer] accesible desde el
/// botón hamburguesa de la barra superior.
class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({super.key, required this.rol});

  final Rol rol;

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

enum _Grupo { operacion, catalogo, administracion, informes }

extension _GrupoLabel on _Grupo {
  String get etiqueta => switch (this) {
    _Grupo.operacion => 'Operación',
    _Grupo.catalogo => 'Catálogo',
    _Grupo.administracion => 'Administración',
    _Grupo.informes => 'Informes',
  };
}

class _Destino {
  const _Destino({
    required this.grupo,
    required this.icono,
    required this.etiqueta,
    required this.pantalla,
    this.roles,
    this.premium = false,
  });

  final _Grupo grupo;
  final IconData icono;
  final String etiqueta;
  final Widget pantalla;
  final Set<Rol>? roles;
  final bool premium;
}

final _destinos = <_Destino>[
  // Operación
  _Destino(
    grupo: _Grupo.operacion,
    icono: Icons.point_of_sale_outlined,
    etiqueta: 'Caja',
    pantalla: CajaPane(),
    roles: {Rol.admin, Rol.cajero},
  ),
  _Destino(
    grupo: _Grupo.operacion,
    icono: Icons.shopping_cart_outlined,
    etiqueta: 'Puesto',
    pantalla: CarritoPane(),
    roles: {Rol.admin, Rol.vendedor},
  ),
  _Destino(
    grupo: _Grupo.operacion,
    icono: Icons.receipt_long_outlined,
    etiqueta: 'Pedidos',
    pantalla: PedidosPane(),
    roles: {Rol.admin, Rol.vendedor},
  ),
  _Destino(
    grupo: _Grupo.operacion,
    icono: Icons.local_shipping_outlined,
    etiqueta: 'Remitos',
    pantalla: RemitosPane(),
    roles: {Rol.admin, Rol.cajero},
  ),
  // Catálogo
  _Destino(
    grupo: _Grupo.catalogo,
    icono: Icons.inventory_2_outlined,
    etiqueta: 'Catálogo',
    pantalla: CatalogoScreen(),
  ),
  _Destino(
    grupo: _Grupo.catalogo,
    icono: Icons.category_outlined,
    etiqueta: 'Productos',
    pantalla: ProductosPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.catalogo,
    icono: Icons.local_shipping_outlined,
    etiqueta: 'Proveedores',
    pantalla: ProveedoresPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.catalogo,
    icono: Icons.storefront_outlined,
    etiqueta: 'Clientes',
    pantalla: ClientesPane(),
    roles: {Rol.admin},
  ),
  // Administración
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.store_outlined,
    etiqueta: 'Sucursales',
    pantalla: SucursalesPane(),
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.palette_outlined,
    etiqueta: 'Identidad',
    pantalla: IdentidadPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.qr_code_2_outlined,
    etiqueta: 'QR del puesto',
    pantalla: QrPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.people_outlined,
    etiqueta: 'Usuarios',
    pantalla: UsuariosPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.notifications_outlined,
    etiqueta: 'Alertas',
    pantalla: AlertasPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.workspace_premium_outlined,
    etiqueta: 'Suscripción',
    pantalla: SuscripcionPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.administracion,
    icono: Icons.receipt_long_outlined,
    etiqueta: 'ARCA',
    pantalla: FacturacionPane(),
    roles: {Rol.admin},
    premium: true,
  ),
  // Informes
  _Destino(
    grupo: _Grupo.informes,
    icono: Icons.desktop_windows_outlined,
    etiqueta: 'Escritorio',
    pantalla: EscritorioPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.informes,
    icono: Icons.dashboard_outlined,
    etiqueta: 'Dashboard',
    pantalla: DashboardPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.informes,
    icono: Icons.leaderboard_outlined,
    etiqueta: 'Reportes',
    pantalla: ReportesPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.informes,
    icono: Icons.add_shopping_cart_outlined,
    etiqueta: 'Reposición',
    pantalla: ReposicionPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.informes,
    icono: Icons.history_outlined,
    etiqueta: 'Auditoría',
    pantalla: AuditoriaPane(),
    roles: {Rol.admin},
  ),
];

const _sidebarAncho = 260.0;
const _quiebreSidebar = 900.0;

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  int _indice = 0;

  List<_Destino> _destinosVisibles({bool esPremium = false}) {
    return _destinos.where((d) {
      if (d.roles != null && !d.roles!.contains(widget.rol)) return false;
      if (d.premium && !esPremium) return false;
      return true;
    }).toList();
  }

  void _seleccionar(int indice) {
    setState(() => _indice = indice);
    Navigator.of(context).maybePop();
  }

  Widget _pantalla(List<_Destino> visibles) {
    if (_indice >= visibles.length) {
      return const _SesionPane();
    }
    return visibles[_indice].pantalla;
  }

  @override
  Widget build(BuildContext context) {
    final sesion = ref.watch(authControllerProvider).sesion;
    final tokens = context.tokens;
    final theme = Theme.of(context);
    final tenant =
        ref.watch(tenantProvider).value ??
        const IdentidadTenant(nombre: 'Mostrador', bajada: '');
    final oscuro = theme.brightness == Brightness.dark;
    final ancho = MediaQuery.sizeOf(context).width;
    final sidebarVisible = ancho >= _quiebreSidebar && widget.rol == Rol.admin;
    final mostrarMesa =
        widget.rol == Rol.admin || widget.rol == Rol.cajero;
    final suscripcionAsync = ref.watch(suscripcionProvider);
    final esPremium = suscripcionAsync.value?.plan.codigo == 'pro';
    final visibles = _destinosVisibles(esPremium: esPremium);
    final indiceActual = _indice.clamp(0, visibles.length - 1);
    final destinoActual = indiceActual < visibles.length
        ? visibles[indiceActual]
        : null;

    return Scaffold(
      body: Row(
        children: [
          if (sidebarVisible)
            _Sidebar(
              tokens: tokens,
              theme: theme,
              tenant: tenant,
              destinos: visibles,
              indice: indiceActual,
              onSeleccionar: _seleccionar,
              sesion: sesion,
              rolLabel: widget.rol.label,
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _TopBar(
                  tokens: tokens,
                  theme: theme,
                  tenant: tenant,
                  sesion: sesion,
                  oscuro: oscuro,
                  mostrarMenu: !sidebarVisible,
                  onMenu: () => _abrirDrawer(context, visibles, indiceActual),
                  destinoActual: destinoActual,
                ),
                const Divider(height: 1),
                if (mostrarMesa) const MesaTurnoWidget(),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1152),
                      child: _pantalla(visibles),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _abrirDrawer(
    BuildContext context,
    List<_Destino> visibles,
    int indice,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        final tokens = ctx.tokens;
        final theme = Theme.of(ctx);
        final items = <Widget>[];
        _Grupo? grupoPrev;
        for (var i = 0; i < visibles.length; i++) {
          final destino = visibles[i];
          if (destino.grupo != grupoPrev) {
            if (grupoPrev != null) items.add(const Divider(height: 24));
            items.add(
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                child: Text(
                  destino.grupo.etiqueta,
                  style: theme.textTheme.labelMedium,
                ),
              ),
            );
            grupoPrev = destino.grupo;
          }
          items.add(
            _DrawerItem(
              destino: destino,
              activo: i == indice,
              tokens: tokens,
              onTap: () => _seleccionar(i),
            ),
          );
        }
        items.add(const Divider(height: 24));
        items.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
            child: Text('Sesión', style: theme.textTheme.labelMedium),
          ),
        );
        items.add(
          _DrawerItem(
            destino: const _Destino(
              grupo: _Grupo.informes,
              icono: Icons.badge_outlined,
              etiqueta: 'Sesión',
              pantalla: _SesionPane(),
            ),
            activo: indice >= visibles.length,
            tokens: tokens,
            onTap: () => _seleccionar(visibles.length),
          ),
        );
        return ListView(children: items);
      },
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.tokens,
    required this.theme,
    required this.tenant,
    required this.destinos,
    required this.indice,
    required this.onSeleccionar,
    required this.sesion,
    required this.rolLabel,
  });

  final TokensMostrador tokens;
  final ThemeData theme;
  final IdentidadTenant tenant;
  final List<_Destino> destinos;
  final int indice;
  final ValueChanged<int> onSeleccionar;
  final StaffSession? sesion;
  final String rolLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _sidebarAncho,
      color: tokens.leaf2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Mostrador',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: tokens.leafFg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (tenant.bajada.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    tenant.bajada,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: tokens.ambar,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Divider(height: 1, color: Colors.white12),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 12),
              children: [
                for (int i = 0; i < destinos.length; i++) ...[
                  if (i == 0 || destinos[i].grupo != destinos[i - 1].grupo) ...[
                    if (i > 0) const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                      child: Text(
                        destinos[i].grupo.etiqueta,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: tokens.leafFg.withValues(alpha: 0.55),
                        ),
                      ),
                    ),
                  ],
                  _SidebarItem(
                    destino: destinos[i],
                    activo: i == indice,
                    tokens: tokens,
                    onTap: () => onSeleccionar(i),
                  ),
                ],
                const SizedBox(height: 12),
                const Divider(height: 1, color: Colors.white12),
                const SizedBox(height: 8),
                _SidebarItem(
                  destino: const _Destino(
                    grupo: _Grupo.informes,
                    icono: Icons.badge_outlined,
                    etiqueta: 'Sesión',
                    pantalla: _SesionPane(),
                  ),
                  activo: indice >= destinos.length,
                  tokens: tokens,
                  onTap: () => onSeleccionar(destinos.length),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Colors.white12),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: tokens.terra,
                  child: Text(
                    _iniciales(sesion?.staff.nombre ?? '?'),
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: tokens.leafFg,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        sesion?.staff.nombre ?? '—',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: tokens.leafFg,
                        ),
                      ),
                      Text(
                        rolLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: tokens.ambar,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _iniciales(String nombre) {
    final partes = nombre.trim().split(RegExp(r'\s+'));
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes[0].substring(0, 1).toUpperCase();
    return '${partes[0].substring(0, 1)}${partes[1].substring(0, 1)}'
        .toUpperCase();
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.destino,
    required this.activo,
    required this.tokens,
    required this.onTap,
  });

  final _Destino destino;
  final bool activo;
  final TokensMostrador tokens;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      child: Material(
        color: activo ? tokens.terra : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  destino.icono,
                  size: 18,
                  color: activo
                      ? tokens.leafFg
                      : tokens.leafFg.withValues(alpha: 0.75),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    destino.etiqueta,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: activo
                          ? tokens.leafFg
                          : tokens.leafFg.withValues(alpha: 0.85),
                      fontWeight: activo ? FontWeight.w600 : FontWeight.w500,
                    ),
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

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.destino,
    required this.activo,
    required this.tokens,
    required this.onTap,
  });

  final _Destino destino;
  final bool activo;
  final TokensMostrador tokens;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      dense: true,
      leading: Icon(destino.icono, color: activo ? tokens.terra : tokens.ink),
      title: Text(
        destino.etiqueta,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: activo ? FontWeight.w600 : FontWeight.w500,
          color: activo ? tokens.terra : tokens.ink,
        ),
      ),
      onTap: onTap,
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({
    required this.tokens,
    required this.theme,
    required this.tenant,
    required this.sesion,
    required this.oscuro,
    required this.mostrarMenu,
    required this.onMenu,
    required this.destinoActual,
  });

  final TokensMostrador tokens;
  final ThemeData theme;
  final IdentidadTenant tenant;
  final StaffSession? sesion;
  final bool oscuro;
  final bool mostrarMenu;
  final VoidCallback onMenu;
  final _Destino? destinoActual;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      color: tokens.leaf2,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          if (mostrarMenu)
            IconButton(
              tooltip: 'Menú',
              color: tokens.leafFg,
              onPressed: onMenu,
              icon: const Icon(Icons.menu),
            )
          else
            const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (destinoActual != null)
                  Text(
                    destinoActual!.etiqueta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: tokens.leafFg,
                    ),
                  ),
                if (sesion != null)
                  Text(
                    sesion!.nombreSucursal,
                    key: const Key('sucursal_actual'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: tokens.leafFg,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            key: const Key('refresh_button'),
            tooltip: 'Actualizar catálogo',
            color: tokens.leafFg,
            onPressed: () => ref.invalidate(catalogoProvider),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            key: const Key('btn_tema'),
            tooltip: 'Cambiar tema',
            color: tokens.leafFg,
            onPressed: () =>
                ref.read(temaControllerProvider.notifier).alternar(),
            icon: Icon(oscuro ? Icons.light_mode : Icons.dark_mode),
          ),
          IconButton(
            key: const Key('logout_button'),
            tooltip: 'Cerrar sesión',
            color: tokens.leafFg,
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
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
        const SizedBox(height: 16),
        const PublicLinks(),
      ],
    );
  }
}
