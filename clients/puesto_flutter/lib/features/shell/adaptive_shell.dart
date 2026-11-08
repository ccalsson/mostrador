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
import '../admin/clientes_app_pane.dart';
import '../admin/clientes_pane.dart';
import '../admin/dashboard_pane.dart';
import '../admin/escritorio_pane.dart';
import '../admin/facturacion_pane.dart';
import '../admin/identidad_pane.dart';
import '../admin/marketing_pane.dart';
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

/// Shell del puesto: replica el header de la web (repoweb app-shell.tsx).
///
/// Una barra leaf-2 fija arriba con la marca, los grupos de navegación como
/// menús desplegables y el cluster de sesión a la derecha. El contenido va
/// centrado sobre paper, con ancho máximo de 1152 px y un bloque de título
/// (kicker + Fraunces) igual al `<main>` de la web. No hay sidebar ni drawer.
class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({super.key, required this.rol});

  final Rol rol;

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

enum _Grupo { operacion, catalogo, administracion, marketing, informes }

extension _GrupoLabel on _Grupo {
  String get etiqueta => switch (this) {
    _Grupo.operacion => 'Operación',
    _Grupo.catalogo => 'Catálogo',
    _Grupo.administracion => 'Administración',
    _Grupo.marketing => 'Marketing',
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
    this.mercado = false,
  });

  final _Grupo grupo;
  final IconData icono;
  final String etiqueta;
  final Widget pantalla;
  final Set<Rol>? roles;
  final bool premium;
  final bool mercado;
}

/// Los 5 grupos de la web, con las secciones propias de Flutter
/// (Pedidos, Catálogo, Sucursales, Alertas, Suscripción, Reportes).
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
  _Destino(
    grupo: _Grupo.operacion,
    icono: Icons.receipt_long_outlined,
    etiqueta: 'ARCA',
    pantalla: FacturacionPane(),
    roles: {Rol.admin},
    premium: true,
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
  _Destino(
    grupo: _Grupo.catalogo,
    icono: Icons.shopping_bag_outlined,
    etiqueta: 'Clientes app',
    pantalla: ClientesAppPane(),
    roles: {Rol.admin},
    mercado: true,
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
  // Marketing
  _Destino(
    grupo: _Grupo.marketing,
    icono: Icons.campaign_outlined,
    etiqueta: 'Marketing',
    pantalla: MarketingPane(),
    roles: {Rol.admin},
  ),
  _Destino(
    grupo: _Grupo.marketing,
    icono: Icons.qr_code_2_outlined,
    etiqueta: 'QR del puesto',
    pantalla: QrPane(),
    roles: {Rol.admin},
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

const _anchoMaxContenido = 1152.0;
const _quiebreHeader = 900.0;
const _quiebreUsuario = 700.0;

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  String? _etiqueta;
  bool _mostrarSesion = false;
  _Grupo? _grupoAbierto;

  /// La web aterriza por rol: admin → /dashboard, cajero → /caja,
  /// vendedor → /vendedor (repoweb/src/routes/index.tsx).
  String get _etiquetaPorRol => switch (widget.rol) {
    Rol.admin => 'Dashboard',
    Rol.cajero => 'Caja',
    Rol.vendedor => 'Puesto',
  };

  List<_Destino> _destinosVisibles({
    bool esPremium = false,
    bool tieneMercado = false,
  }) {
    return _destinos.where((d) {
      if (d.roles != null && !d.roles!.contains(widget.rol)) return false;
      if (d.premium && !esPremium) return false;
      if (d.mercado && !tieneMercado) return false;
      return true;
    }).toList();
  }

  void _seleccionar(String etiqueta) {
    setState(() {
      _etiqueta = etiqueta;
      _mostrarSesion = false;
      _grupoAbierto = null;
    });
  }

  void _irASesion() {
    setState(() {
      _mostrarSesion = true;
      _grupoAbierto = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final sesion = ref.watch(authControllerProvider).sesion;
    final tokens = context.tokens;
    final tenant =
        ref.watch(tenantProvider).value ??
        const IdentidadTenant(nombre: 'Mostrador', bajada: '');
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final ancho = MediaQuery.sizeOf(context).width;
    final suscripcionAsync = ref.watch(suscripcionProvider);
    final esPremium = suscripcionAsync.value?.plan.codigo == 'pro';
    final tieneMercado =
        suscripcionAsync.value?.mercadoAlToqueContratado == true;
    final visibles = _destinosVisibles(
      esPremium: esPremium,
      tieneMercado: tieneMercado,
    );

    final etiqueta = _etiqueta ?? _etiquetaPorRol;
    _Destino? destino;
    for (final d in visibles) {
      if (d.etiqueta == etiqueta) destino = d;
    }
    // Si la sección pedida dejó de estar disponible (p. ej. se cayó premium),
    // volver al destino inicial del rol o al primero visible.
    if (destino == null) {
      for (final d in visibles) {
        if (d.etiqueta == _etiquetaPorRol) destino = d;
      }
      destino ??= visibles.isEmpty ? null : visibles.first;
    }

    final titulo = _mostrarSesion ? 'Sesión' : (destino?.etiqueta ?? 'Sesión');
    final pantalla = _mostrarSesion
        ? const _SesionPane()
        : (destino?.pantalla ?? const _SesionPane());

    final grupos = <_Grupo, List<_Destino>>{};
    for (final d in visibles) {
      grupos.putIfAbsent(d.grupo, () => []).add(d);
    }

    final mostrarMesa =
        (widget.rol == Rol.admin || widget.rol == Rol.cajero) &&
        (destino?.etiqueta == 'Dashboard' || destino?.etiqueta == 'Caja');
    final paddingH = ancho >= 640 ? 24.0 : 16.0;

    return Scaffold(
      backgroundColor: tokens.paper,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(
            tokens: tokens,
            ancho: ancho,
            tenant: tenant,
            sesion: sesion,
            rol: widget.rol,
            oscuro: oscuro,
            grupos: grupos,
            etiquetaActiva: _mostrarSesion ? null : destino?.etiqueta,
            grupoAbierto: _grupoAbierto,
            etiquetaPorRol: _etiquetaPorRol,
            onAbrirGrupo: (g) => setState(() => _grupoAbierto = g),
            onCerrarGrupo: () => setState(() => _grupoAbierto = null),
            onSeleccionar: _seleccionar,
            onSesion: _irASesion,
          ),
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: _anchoMaxContenido,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: EdgeInsets.fromLTRB(paddingH, 20, paddingH, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'EL PUESTO',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 1.5,
                              color: tokens.muted,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            titulo,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'Fraunces',
                              fontSize: 26,
                              fontWeight: FontWeight.w600,
                              height: 1.1,
                              letterSpacing: -0.4,
                              color: tokens.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (mostrarMesa)
                      Padding(
                        padding: EdgeInsets.fromLTRB(paddingH, 16, paddingH, 0),
                        child: Container(
                          decoration: BoxDecoration(
                            color: tokens.surface,
                            border: Border.all(color: tokens.line),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: const MesaTurnoWidget(),
                        ),
                      ),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.all(paddingH),
                        child: pantalla,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.tokens,
    required this.ancho,
    required this.tenant,
    required this.sesion,
    required this.rol,
    required this.oscuro,
    required this.grupos,
    required this.etiquetaActiva,
    required this.grupoAbierto,
    required this.etiquetaPorRol,
    required this.onAbrirGrupo,
    required this.onCerrarGrupo,
    required this.onSeleccionar,
    required this.onSesion,
  });

  final TokensMostrador tokens;
  final double ancho;
  final IdentidadTenant tenant;
  final StaffSession? sesion;
  final Rol rol;
  final bool oscuro;
  final Map<_Grupo, List<_Destino>> grupos;
  final String? etiquetaActiva;
  final _Grupo? grupoAbierto;
  final String etiquetaPorRol;
  final ValueChanged<_Grupo> onAbrirGrupo;
  final VoidCallback onCerrarGrupo;
  final ValueChanged<String> onSeleccionar;
  final VoidCallback onSesion;

  @override
  Widget build(BuildContext context) {
    final anchoCompleto = ancho >= _quiebreHeader;
    final nav = _Nav(
      tokens: tokens,
      grupos: grupos,
      etiquetaActiva: etiquetaActiva,
      grupoAbierto: grupoAbierto,
      onAbrirGrupo: onAbrirGrupo,
      onCerrarGrupo: onCerrarGrupo,
      onSeleccionar: onSeleccionar,
    );
    final marca = _Marca(
      tokens: tokens,
      tenant: tenant,
      onTap: () => onSeleccionar(etiquetaPorRol),
    );
    final cluster = _Cluster(
      tokens: tokens,
      sesion: sesion,
      rol: rol,
      oscuro: oscuro,
      mostrarUsuario: ancho >= _quiebreUsuario,
      mostrarSucursal: anchoCompleto,
      onSesion: onSesion,
    );

    return Container(
      color: tokens.leaf2,
      child: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: _anchoMaxContenido),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: anchoCompleto
                  ? Row(
                      children: [
                        marca,
                        const SizedBox(width: 12),
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: nav,
                          ),
                        ),
                        const SizedBox(width: 8),
                        cluster,
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: marca),
                            cluster,
                          ],
                        ),
                        const SizedBox(height: 4),
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: nav,
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Marca extends StatelessWidget {
  const _Marca({
    required this.tokens,
    required this.tenant,
    required this.onTap,
  });

  final TokensMostrador tokens;
  final IdentidadTenant tenant;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Mostrador',
              style: TextStyle(
                fontFamily: 'Fraunces',
                fontSize: 16,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.2,
                color: tokens.leafFg,
              ),
            ),
            if (tenant.bajada.isNotEmpty) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  tenant.bajada,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: tokens.ambar),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Nav extends StatelessWidget {
  const _Nav({
    required this.tokens,
    required this.grupos,
    required this.etiquetaActiva,
    required this.grupoAbierto,
    required this.onAbrirGrupo,
    required this.onCerrarGrupo,
    required this.onSeleccionar,
  });

  final TokensMostrador tokens;
  final Map<_Grupo, List<_Destino>> grupos;
  final String? etiquetaActiva;
  final _Grupo? grupoAbierto;
  final ValueChanged<_Grupo> onAbrirGrupo;
  final VoidCallback onCerrarGrupo;
  final ValueChanged<String> onSeleccionar;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final grupo in _Grupo.values)
          if (grupos[grupo]?.isNotEmpty ?? false)
            _GrupoBoton(
              key: Key('nav_grupo_${grupo.name}'),
              tokens: tokens,
              grupo: grupo,
              items: grupos[grupo]!,
              etiquetaActiva: etiquetaActiva,
              abierto: grupoAbierto == grupo,
              onAbrir: () => onAbrirGrupo(grupo),
              onCerrar: onCerrarGrupo,
              onSeleccionar: onSeleccionar,
            ),
      ],
    );
  }
}

class _GrupoBoton extends StatelessWidget {
  const _GrupoBoton({
    super.key,
    required this.tokens,
    required this.grupo,
    required this.items,
    required this.etiquetaActiva,
    required this.abierto,
    required this.onAbrir,
    required this.onCerrar,
    required this.onSeleccionar,
  });

  final TokensMostrador tokens;
  final _Grupo grupo;
  final List<_Destino> items;
  final String? etiquetaActiva;
  final bool abierto;
  final VoidCallback onAbrir;
  final VoidCallback onCerrar;
  final ValueChanged<String> onSeleccionar;

  bool get _contieneActivo =>
      etiquetaActiva != null && items.any((d) => d.etiqueta == etiquetaActiva);

  @override
  Widget build(BuildContext context) {
    final resaltado = abierto || _contieneActivo;
    final colorTexto = resaltado
        ? tokens.leafFg
        : tokens.leafFg.withValues(alpha: 0.7);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 1),
      child: PopupMenuButton<String>(
        tooltip: '',
        position: PopupMenuPosition.under,
        offset: const Offset(0, 4),
        color: tokens.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
          side: BorderSide(color: tokens.line),
        ),
        onOpened: onAbrir,
        onCanceled: onCerrar,
        onSelected: onSeleccionar,
        itemBuilder: (context) => [
          for (final item in items)
            PopupMenuItem<String>(
              key: Key('nav_item_${item.etiqueta}'),
              value: item.etiqueta,
              height: 36,
              padding: EdgeInsets.zero,
              child: Container(
                height: 36,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                alignment: Alignment.centerLeft,
                color: item.etiqueta == etiquetaActiva
                    ? tokens.leaf.withValues(alpha: 0.1)
                    : Colors.transparent,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      item.icono,
                      size: 14,
                      color: item.etiqueta == etiquetaActiva
                          ? tokens.leaf
                          : tokens.ink,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      item.etiqueta,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: item.etiqueta == etiquetaActiva
                            ? FontWeight.w600
                            : FontWeight.w400,
                        color: item.etiqueta == etiquetaActiva
                            ? tokens.leaf
                            : tokens.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
        child: Container(
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: resaltado ? Colors.white.withValues(alpha: 0.15) : null,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                grupo.etiqueta,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: colorTexto,
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.arrow_drop_down, size: 14, color: colorTexto),
            ],
          ),
        ),
      ),
    );
  }
}

class _Cluster extends ConsumerWidget {
  const _Cluster({
    required this.tokens,
    required this.sesion,
    required this.rol,
    required this.oscuro,
    required this.mostrarUsuario,
    required this.mostrarSucursal,
    required this.onSesion,
  });

  final TokensMostrador tokens;
  final StaffSession? sesion;
  final Rol rol;
  final bool oscuro;
  final bool mostrarUsuario;
  final bool mostrarSucursal;
  final VoidCallback onSesion;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final icono = tokens.leafFg.withValues(alpha: 0.85);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (mostrarSucursal && sesion != null) ...[
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Text(
              sesion!.nombreSucursal,
              key: const Key('sucursal_actual'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                color: tokens.leafFg.withValues(alpha: 0.7),
              ),
            ),
          ),
          const SizedBox(width: 6),
        ],
        IconButton(
          key: const Key('refresh_button'),
          tooltip: 'Actualizar catálogo',
          color: icono,
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          onPressed: () => ref.invalidate(catalogoProvider),
          icon: const Icon(Icons.refresh),
        ),
        IconButton(
          key: const Key('btn_tema'),
          tooltip: 'Cambiar tema',
          color: icono,
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          onPressed: () => ref.read(temaControllerProvider.notifier).alternar(),
          icon: Icon(oscuro ? Icons.light_mode : Icons.dark_mode),
        ),
        if (mostrarUsuario && sesion != null)
          PopupMenuButton<String>(
            tooltip: '',
            position: PopupMenuPosition.under,
            color: tokens.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(6),
              side: BorderSide(color: tokens.line),
            ),
            onSelected: (v) {
              if (v == 'sesion') onSesion();
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                key: const Key('nav_item_Sesión'),
                value: 'sesion',
                height: 36,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.badge_outlined, size: 14, color: tokens.ink),
                    const SizedBox(width: 8),
                    Text(
                      'Sesión',
                      style: TextStyle(fontSize: 13, color: tokens.ink),
                    ),
                  ],
                ),
              ),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: oscuro ? tokens.btn : tokens.terra,
                    child: Text(
                      _iniciales(sesion!.staff.nombre),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: tokens.btnFg,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 130),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          sesion!.staff.nombre,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: tokens.leafFg,
                          ),
                        ),
                        Text(
                          rol.label,
                          style: TextStyle(fontSize: 10, color: tokens.ambar),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        IconButton(
          key: const Key('logout_button'),
          tooltip: 'Cerrar sesión',
          color: icono,
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          icon: const Icon(Icons.logout),
        ),
      ],
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
