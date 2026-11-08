import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/producto.dart';
import '../../models/reportes.dart';
import '../../services/canal_mercado_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/reportes_service.dart';
import 'ajuste_stock_dialog.dart';
import 'costos_masivos_dialog.dart';
import 'producto_form_dialog.dart';

/// Gestión de catálogo del Dueño: alta, edición, baja y ajustes de stock.
///
/// Sigue la composición de la web: tabla al centro, rankings a los costados y
/// el formulario de alta/edición en un diálogo.
class ProductosPane extends ConsumerStatefulWidget {
  const ProductosPane({super.key});

  @override
  ConsumerState<ProductosPane> createState() => _ProductosPaneState();
}

class _ProductosPaneState extends ConsumerState<ProductosPane> {
  String _busqueda = '';
  String? _seleccion;

  List<Producto> _filtrar(List<Producto> productos) {
    final texto = _busqueda.trim().toLowerCase();
    if (texto.isEmpty) return productos;
    return productos
        .where(
          (p) =>
              p.nombre.toLowerCase().contains(texto) ||
              p.alias.any((a) => a.toLowerCase().contains(texto)),
        )
        .toList();
  }

  void _elegir(String id) =>
      setState(() => _seleccion = _seleccion == id ? null : id);

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final ancho = constraints.maxWidth;
        final compacto = ancho < 620;
        final conRail = ancho >= 1024;
        final conRanking = ancho >= 1280;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: TextField(
                      key: const Key('admin_buscar_producto'),
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search, size: 20),
                        hintText: 'Buscar',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) => setState(() => _busqueda = value),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  key: const Key('admin_costos_masivos'),
                  onPressed: () => mostrarCostosMasivosDialog(context),
                  icon: const Icon(Icons.currency_exchange, size: 18),
                  label: Text(compacto ? 'Costos' : 'Gestión masiva costos'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  key: const Key('admin_nuevo_producto'),
                  onPressed: () => mostrarFormProducto(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(compacto ? 'Nuevo' : 'Nuevo producto'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _BarraCanalMercado(),
            const SizedBox(height: 12),
            Expanded(
              child: catalogo.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        error is ApiException
                            ? error.message
                            : 'No se pudo cargar el catálogo.',
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        key: const Key('admin_productos_reintentar'),
                        onPressed: () => ref.invalidate(catalogoProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (data) {
                  final productos = _filtrar(data.productos);
                  final elegido = data.productos
                      .where((p) => p.id == _seleccion)
                      .firstOrNull;

                  final tabla = _TablaProductos(
                    productos: productos,
                    compacto: compacto,
                    seleccion: _seleccion,
                    seleccionable: conRail,
                    onElegir: _elegir,
                    onEditar: (producto) =>
                        mostrarFormProducto(context, existente: producto),
                    onAjustar: (producto) =>
                        mostrarAjusteStock(context, producto),
                  );

                  if (!conRail) return tabla;

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (conRanking)
                        Padding(
                          padding: const EdgeInsets.only(right: 16),
                          child: SizedBox(
                            width: 232,
                            child: _RankingCard(
                              titulo: 'Más vendidos · 7 días',
                              semana: true,
                              activo: _seleccion,
                              onElegir: _elegir,
                            ),
                          ),
                        ),
                      Expanded(child: tabla),
                      Padding(
                        padding: const EdgeInsets.only(left: 16),
                        child: SizedBox(
                          width: 288,
                          child: SingleChildScrollView(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _HistorialCard(producto: elegido),
                                const SizedBox(height: 16),
                                _RankingCard(
                                  titulo: 'Más vendidos · 30 días',
                                  semana: false,
                                  activo: _seleccion,
                                  onElegir: _elegir,
                                ),
                              ],
                            ),
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
      },
    );
  }
}

class _TablaProductos extends StatelessWidget {
  const _TablaProductos({
    required this.productos,
    required this.compacto,
    required this.seleccion,
    required this.seleccionable,
    required this.onElegir,
    required this.onEditar,
    required this.onAjustar,
  });

  final List<Producto> productos;
  final bool compacto;
  final String? seleccion;
  final bool seleccionable;
  final ValueChanged<String> onElegir;
  final ValueChanged<Producto> onEditar;
  final ValueChanged<Producto> onAjustar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    if (productos.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          key: const Key('admin_productos_vacia'),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'Ningún producto con ese nombre.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }

    final columnas = compacto
        ? const [
            ColumnaTabla('Nombre'),
            ColumnaTabla('Precio', ancho: 92, alineacion: TextAlign.end),
            ColumnaTabla('', ancho: 96, alineacion: TextAlign.end),
          ]
        : const [
            ColumnaTabla('Nombre', flex: 4),
            ColumnaTabla('Precio', ancho: 104, alineacion: TextAlign.end),
            ColumnaTabla('Stock', ancho: 104, alineacion: TextAlign.end),
            ColumnaTabla('', ancho: 200, alineacion: TextAlign.end),
          ];

    return Tarjeta(
      padding: EdgeInsets.zero,
      child: TablaWeb(
        key: const Key('admin_productos_lista'),
        columnas: columnas,
        filas: [
          for (final producto in productos)
            FilaTabla(
              key: Key('admin_producto_${producto.id}'),
              seleccionada: seleccion == producto.id,
              onTap: () =>
                  seleccionable ? onElegir(producto.id) : onEditar(producto),
              celdas: [
                _celdaNombre(context, producto),
                _numero(moneda(producto.precio), tokens),
                if (!compacto)
                  _numero(
                    '${cantidadNum(producto.stock)} ${producto.unidadLabel}',
                    tokens,
                  ),
                compacto ? _accionesCompactas(producto) : _acciones(producto),
              ],
            ),
        ],
      ),
    );
  }

  /// Celda numérica tabular que se encoge antes que desbordar la columna.
  Widget _numero(String texto, TokensMostrador tokens) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerRight,
      child: Text(texto, style: TablaWeb.numeros.copyWith(color: tokens.ink)),
    );
  }

  Widget _celdaNombre(BuildContext context, Producto producto) {
    final tokens = context.tokens;
    final etiquetas = <Widget>[
      if (producto.stockBajo) Pildora('Bajo', color: tokens.terra),
      if (!producto.activo) Pildora('Baja', color: tokens.muted),
    ];

    return Row(
      children: [
        _Thumbnail(url: producto.fotoUrl, lado: compacto ? 32 : 36),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      producto.nombre,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: tokens.ink,
                      ),
                    ),
                  ),
                  for (final etiqueta in etiquetas) ...[
                    const SizedBox(width: 6),
                    etiqueta,
                  ],
                ],
              ),
              if (compacto) ...[
                const SizedBox(height: 2),
                Text(
                  '${cantidadNum(producto.stock)} ${producto.unidadLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: tokens.muted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _acciones(Producto producto) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _BotonTabla(
          etiqueta: 'Editar',
          clave: Key('admin_editar_${producto.id}'),
          onPressed: () => onEditar(producto),
        ),
        const SizedBox(width: 6),
        _BotonTabla(
          etiqueta: 'Stock',
          clave: Key('admin_ajustar_${producto.id}'),
          onPressed: () => onAjustar(producto),
        ),
      ],
    );
  }

  Widget _accionesCompactas(Producto producto) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          key: Key('admin_editar_${producto.id}'),
          tooltip: 'Editar',
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          style: IconButton.styleFrom(
            minimumSize: const Size(30, 30),
            padding: EdgeInsets.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          onPressed: () => onEditar(producto),
          icon: const Icon(Icons.edit_outlined),
        ),
        IconButton(
          key: Key('admin_ajustar_${producto.id}'),
          tooltip: 'Ajustar stock',
          visualDensity: VisualDensity.compact,
          iconSize: 18,
          style: IconButton.styleFrom(
            minimumSize: const Size(30, 30),
            padding: EdgeInsets.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          onPressed: () => onAjustar(producto),
          icon: const Icon(Icons.tune),
        ),
      ],
    );
  }
}

class _BotonTabla extends StatelessWidget {
  const _BotonTabla({
    required this.etiqueta,
    required this.clave,
    required this.onPressed,
  });

  final String etiqueta;
  final Key clave;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return OutlinedButton(
      key: clave,
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 30),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        side: BorderSide(color: tokens.line),
        foregroundColor: tokens.inkSoft,
        textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
      ),
      child: Text(etiqueta),
    );
  }
}

/// Thumbnail cuadrado con bordes redondeados para la foto del producto.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({this.url, this.lado = 36});

  final String? url;
  final double lado;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final fullUrl = url != null ? '${AppConfig.apiBaseUrl}$url' : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        width: lado,
        height: lado,
        child: fullUrl != null
            ? Image.network(
                fullUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _sinFoto(tokens),
                loadingBuilder: (ctx, child, progress) {
                  if (progress == null) return child;
                  return Container(color: tokens.paper2);
                },
              )
            : _sinFoto(tokens),
      ),
    );
  }

  Widget _sinFoto(TokensMostrador tokens) => Container(
        color: tokens.paper2,
        alignment: Alignment.center,
        child: Text('Foto', style: TextStyle(fontSize: 9, color: tokens.muted)),
      );
}

/// Panel de historial de ventas del producto elegido (últimos 30 días).
class _HistorialCard extends ConsumerWidget {
  const _HistorialCard({required this.producto});

  final Producto? producto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final elegido = producto;

    if (elegido == null) {
      return Tarjeta(
        titulo: 'Historial',
        subtitulo:
            'Últimos 30 días, pedidos cobrados o entregados. Tocá un producto.',
        child: Text(
          'Todavía no elegiste ninguno.',
          key: const Key('admin_producto_historial_vacio'),
          style: TextStyle(fontSize: 13, color: tokens.muted),
        ),
      );
    }

    final historial = ref.watch(historialProductoProvider(elegido.id));

    return Tarjeta(
      titulo: 'Ventas · ${elegido.nombre}',
      subtitulo: 'Últimos 30 días, pedidos cobrados o entregados.',
      child: historial.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (error, _) => Text(
          error is ApiException
              ? error.message
              : 'No se pudo cargar el historial.',
          style: TextStyle(fontSize: 12.5, color: tokens.muted),
        ),
        data: (data) => _listaHistorial(context, data),
      ),
    );
  }

  Widget _listaHistorial(BuildContext context, HistorialProducto data) {
    final tokens = context.tokens;
    if (data.dias.isEmpty) {
      return Text(
        'Sin ventas en el período.',
        style: TextStyle(fontSize: 13, color: tokens.muted),
      );
    }
    return Column(
      key: const Key('admin_producto_historial'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final dia in data.dias)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Text(
                  _etiquetaDia(dia.dia),
                  style: TextStyle(fontSize: 12.5, color: tokens.muted),
                ),
                const Spacer(),
                Text(
                  '${cantidadNum(dia.cantidad)} · ${moneda(dia.total)}',
                  style: TablaWeb.numeros.copyWith(color: tokens.ink),
                ),
              ],
            ),
          ),
      ],
    );
  }

  /// `2026-10-01` → `01/10`.
  String _etiquetaDia(String dia) => dia.length >= 10
      ? '${dia.substring(8, 10)}/${dia.substring(5, 7)}'
      : dia;
}

/// Ranking de más vendidos, equivalente al panel lateral de la web.
class _RankingCard extends ConsumerWidget {
  const _RankingCard({
    required this.titulo,
    required this.semana,
    required this.activo,
    required this.onElegir,
  });

  final String titulo;
  final bool semana;
  final String? activo;
  final ValueChanged<String> onElegir;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = context.tokens;
    final reportes = ref.watch(reporteProductosProvider);

    return Tarjeta(
      titulo: titulo,
      child: reportes.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (_, _) => Text(
          'Sin ventas cobradas en este período.',
          style: TextStyle(fontSize: 12.5, color: tokens.muted),
        ),
        data: (data) {
          final filas = semana ? data.semana : data.mes;
          if (filas.isEmpty) {
            return Text(
              'Sin ventas cobradas en este período.',
              style: TextStyle(fontSize: 12.5, color: tokens.muted),
            );
          }
          return Column(
            key: Key(semana ? 'admin_ranking_semana' : 'admin_ranking_mes'),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < filas.length; i++)
                _FilaRanking(
                  posicion: i + 1,
                  venta: filas[i],
                  activo: activo == filas[i].productoId,
                  onElegir: onElegir,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _FilaRanking extends StatelessWidget {
  const _FilaRanking({
    required this.posicion,
    required this.venta,
    required this.activo,
    required this.onElegir,
  });

  final int posicion;
  final ReporteVentaProducto venta;
  final bool activo;
  final ValueChanged<String> onElegir;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final color = activo ? tokens.leaf : tokens.ink;

    return InkWell(
      key: Key('admin_ranking_${venta.productoId}'),
      onTap: () => onElegir(venta.productoId),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            SizedBox(
              width: 18,
              child: Text(
                '$posicion',
                style: TablaWeb.numeros.copyWith(
                  fontSize: 12,
                  color: tokens.muted,
                ),
              ),
            ),
            Expanded(
              child: Text(
                venta.nombre,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: color,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${cantidadNum(venta.cantidad)} · ${moneda(venta.total)}',
              style: TablaWeb.numeros.copyWith(
                fontSize: 11.5,
                color: tokens.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BarraCanalMercado extends ConsumerStatefulWidget {
  @override
  ConsumerState<_BarraCanalMercado> createState() => _BarraCanalMercadoState();
}

class _BarraCanalMercadoState extends ConsumerState<_BarraCanalMercado> {
  bool _guardando = false;

  Future<void> _toggle(bool valor) async {
    setState(() => _guardando = true);
    try {
      await ref.read(canalMercadoServiceProvider).guardar(valor);
      ref.invalidate(canalMercadoProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
            const SnackBar(content: Text('No se pudo actualizar el canal.')));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canal = ref.watch(canalMercadoProvider);
    final theme = Theme.of(context);

    return canal.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (canal) {
        final puedeToggle = canal.presencia && !_guardando;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: Checkbox(
                    key: const Key('canal_mercado_toggle'),
                    value: canal.activo,
                    onChanged: puedeToggle ? (v) => _toggle(v ?? false) : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Este puesto aparece en Mercado al Toque',
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            if (canal.activo) ...[
              const SizedBox(height: 4),
              Text(
                'Este puesto está en Mercado. El cartel se imprime en QR.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.primary),
              ),
            ],
            if (!canal.presencia) ...[
              const SizedBox(height: 4),
              Text(
                'Este puesto no tiene Presencia ni Pro. '
                'Publicar no alcanza para aparecer en Mercado.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.error),
              ),
            ],
            if (canal.presencia) ...[
              const SizedBox(height: 4),
              Text(
                'El plan cubre la caja y el stock de todas las sucursales. '
                'Mercado es de cada puesto.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ],
        );
      },
    );
  }
}
