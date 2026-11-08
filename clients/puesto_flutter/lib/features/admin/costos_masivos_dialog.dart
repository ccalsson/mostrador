import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/tema.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import '../../services/productos_service.dart';

/// Dialog de gestión masiva de costos/márgenes para admin/dueño.
///
/// Muestra una tabla con todos los productos activos: nombre, costo actual,
/// margen %, precio calculado. Permite editar costo y margen de múltiples
/// productos a la vez y guardar los cambios en batch.
///
/// Precio calculado = costo * (1 + margen/100).
Future<void> mostrarCostosMasivosDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const CostosMasivosDialog(),
  );
}

class CostosMasivosDialog extends ConsumerStatefulWidget {
  const CostosMasivosDialog({super.key});

  @override
  ConsumerState<CostosMasivosDialog> createState() =>
      _CostosMasivosDialogState();
}

class _CostosMasivosDialogState extends ConsumerState<CostosMasivosDialog> {
  /// Costos editados por producto: productoId -> costo.
  final Map<String, double?> _costosEditados = {};

  /// Márgenes editados por producto: productoId -> margen %.
  final Map<String, double?> _margenesEditados = {};

  bool _guardando = false;
  String? _error;

  /// Calcula el precio a partir de costo y margen.
  double _precioCalculado(double? costo, double? margen) {
    final c = costo ?? 0;
    final m = margen ?? 0;
    if (c <= 0) return 0;
    return c * (1 + m / 100);
  }

  Future<void> _guardar() async {
    // Solo enviar los productos que tienen costo editado.
    final items = <({String productoId, double? costo})>[];
    for (final entry in _costosEditados.entries) {
      items.add((productoId: entry.key, costo: entry.value));
    }
    if (items.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      final actualizados = await ref
          .read(productosAdminServiceProvider)
          .actualizarCostosMasivos(items);
      if (!mounted) return;
      ref.invalidate(catalogoProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$actualizados producto(s) actualizado(s).'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().contains('Exception')
            ? e.toString().replaceAll('Exception: ', '')
            : 'No se pudieron guardar los costos.';
        _guardando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);
    final tokens = context.tokens;

    return AlertDialog(
      title: const Text('Gestión masiva de costos'),
      content: SizedBox(
        width: 680,
        height: 520,
        child: catalogo.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Error al cargar el catálogo: $e'),
          ),
          data: (data) => _buildTabla(data.productos, tokens),
        ),
      ),
      actions: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        TextButton(
          onPressed: _guardando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _guardando ? null : _guardar,
          child: _guardando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Guardar cambios'),
        ),
      ],
    );
  }

  Widget _buildTabla(List<Producto> productos, TokensMostrador tokens) {
    // Solo mostrar productos activos con costo o margen.
    final relevantes =
        productos.where((p) => p.activo && (p.costo != null || p.costo != 0)).toList();
    if (relevantes.isEmpty) {
      return Center(
        child: Text(
          'No hay productos con costo para gestionar.',
          style: TextStyle(color: tokens.muted),
        ),
      );
    }
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: tokens.paper2,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
          ),
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: Text('Producto',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: tokens.muted)),
              ),
              Expanded(
                child: Text('Costo',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: tokens.muted)),
              ),
              Expanded(
                child: Text('Margen %',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: tokens.muted)),
              ),
              Expanded(
                child: Text('P. calc.',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: tokens.muted)),
              ),
            ],
          ),
        ),
        // Lista scrollable
        Expanded(
          child: ListView.separated(
            itemCount: relevantes.length,
            separatorBuilder: (_, _) => Divider(height: 1, color: tokens.line),
            itemBuilder: (context, index) {
              final producto = relevantes[index];
              return _FilaCostoProducto(
                producto: producto,
                costoEditado: _costosEditados[producto.id],
                margenEditado: _margenesEditados[producto.id],
                onCostoChanged: (v) =>
                    setState(() => _costosEditados[producto.id] = v),
                onMargenChanged: (v) =>
                    setState(() => _margenesEditados[producto.id] = v),
                precioCalculado: _precioCalculado(
                  _costosEditados[producto.id] ?? producto.costo,
                  _margenesEditados[producto.id] ?? producto.margen,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _FilaCostoProducto extends StatelessWidget {
  const _FilaCostoProducto({
    required this.producto,
    required this.costoEditado,
    required this.margenEditado,
    required this.onCostoChanged,
    required this.onMargenChanged,
    required this.precioCalculado,
  });

  final Producto producto;
  final double? costoEditado;
  final double? margenEditado;
  final ValueChanged<double?> onCostoChanged;
  final ValueChanged<double?> onMargenChanged;
  final double precioCalculado;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final costoActual = costoEditado ?? producto.costo ?? 0;
    final margenActual = margenEditado ?? producto.margen ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              producto.nombre,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: tokens.ink),
            ),
          ),
          Expanded(
            child: SizedBox(
              height: 32,
              child: TextField(
                key: Key('costo_masivo_${producto.id}'),
                decoration: const InputDecoration(
                  isDense: true,
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(fontSize: 12),
                controller: TextEditingController(
                  text: costoActual > 0 ? cantidadNum(costoActual) : '',
                ),
                onChanged: (v) {
                  final parsed = parseDecimal(v);
                  onCostoChanged(parsed);
                },
              ),
            ),
          ),
          Expanded(
            child: SizedBox(
              height: 32,
              child: TextField(
                key: Key('margen_masivo_${producto.id}'),
                decoration: const InputDecoration(
                  isDense: true,
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(fontSize: 12),
                controller: TextEditingController(
                  text: margenActual > 0 ? margenActual.toStringAsFixed(1) : '',
                ),
                onChanged: (v) {
                  final parsed = double.tryParse(v.replaceAll(',', '.'));
                  onMargenChanged(parsed);
                },
              ),
            ),
          ),
          Expanded(
            child: Text(
              moneda(precioCalculado),
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: precioCalculado > 0 ? tokens.ink : tokens.muted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
