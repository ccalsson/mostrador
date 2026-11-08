import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/ids.dart';
import '../../models/cobro.dart';
import '../../models/producto.dart';
import '../../services/catalogo_service.dart';
import '../../services/clientes_service.dart';
import '../../services/pedidos_service.dart';

/// Venta directa: crea un pedido y lo cobra en un solo paso, sin pasar por
/// la cola. Equivale al módulo `VentaDirecta` de la web (caja.tsx:668-777).
///
/// Flujo: buscar producto → agregar al carrito → elegir cliente → elegir
/// forma de pago → ingresar monto recibido (efectivo) → cobrar.
/// El backend crea el pedido (POST /api/v1/pedidos) y lo cobra
/// (POST /api/v1/pedidos/:id/cobrar) en dos llamadas secuenciales.
class VentaDirectaDialog extends ConsumerStatefulWidget {
  const VentaDirectaDialog({super.key});

  @override
  ConsumerState<VentaDirectaDialog> createState() => _VentaDirectaDialogState();
}

class _VentaDirectaDialogState extends ConsumerState<VentaDirectaDialog> {
  final _busqueda = TextEditingController();
  final _recibido = TextEditingController();
  final Map<String, int> _carrito = {};
  FormaPago _forma = FormaPago.efectivo;
  String _clienteNombre = 'Mostrador';
  bool _cobrando = false;
  String? _error;

  @override
  void dispose() {
    _busqueda.dispose();
    _recibido.dispose();
    super.dispose();
  }

  List<_LineaCarrito> get _lineas {
    final catalogo = ref.read(catalogoProvider).value;
    if (catalogo == null) return const [];
    return [
      for (final entry in _carrito.entries)
        if (entry.value > 0)
          () {
            final p = catalogo.productos.firstWhere(
              (x) => x.id == entry.key,
              orElse: () => _productoVacio,
            );
            if (p.id.isEmpty) return null;
            return _LineaCarrito(producto: p, cantidad: entry.value);
          }()!,
    ];
  }

  double get _total => _lineas.fold(
        0,
        (acc, l) => acc + l.producto.precio * l.cantidad,
      );

  double? get _recibidoNum => parseDecimal(_recibido.text);

  double get _vueltoEstimado {
    if (_forma != FormaPago.efectivo) return 0;
    final r = _recibidoNum;
    if (r == null || r < _total) return 0;
    return redondear2(r - _total);
  }

  bool get _puedeCobrar => _lineas.isNotEmpty && !_cobrando;

  void _agregar(Producto p) {
    setState(() {
      _carrito[p.id] = (_carrito[p.id] ?? 0) + 1;
    });
  }

  void _quitar(String productoId) {
    setState(() {
      final actual = _carrito[productoId] ?? 0;
      if (actual <= 1) {
        _carrito.remove(productoId);
      } else {
        _carrito[productoId] = actual - 1;
      }
    });
  }

  void _incrementar(String productoId) {
    setState(() {
      _carrito[productoId] = (_carrito[productoId] ?? 0) + 1;
    });
  }

  void _eliminar(String productoId) {
    setState(() {
      _carrito.remove(productoId);
    });
  }

  Future<void> _cobrar() async {
    setState(() {
      _cobrando = true;
      _error = null;
    });
    try {
      final pedidosService = ref.read(pedidosServiceProvider);
      final uuid = generarUuidV4();
      final pedido = await pedidosService.crear(
        clientUuid: uuid,
        clienteNombre: _clienteNombre,
        items: [
          for (final linea in _lineas)
            (productoId: linea.producto.id, cantidad: linea.cantidad),
        ],
      );
      final resultado = await pedidosService.cobrar(
        pedido.id,
        clientUuid: 'cobro-${pedido.id}',
        formaPago: _forma,
        montoRecibido:
            _forma == FormaPago.efectivo ? (_recibidoNum ?? _total) : _total,
      );
      if (!mounted) return;
      ref.invalidate(pedidosColaProvider);
      ref.invalidate(catalogoProvider);
      Navigator.of(context).pop(resultado);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _cobrando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalogo = ref.watch(catalogoProvider);
    final clientes = ref.watch(clientesProvider);
    final tema = Theme.of(context);
    final aguja = _busqueda.text.trim().toLowerCase();

    final productos = catalogo.value?.productos ?? const [];
    final filtrados = productos
        .where((p) =>
            p.activo &&
            (aguja.isEmpty ||
                p.nombre.toLowerCase().contains(aguja) ||
                p.alias.any((a) => a.toLowerCase().contains(aguja))))
        .take(20)
        .toList();

    return Dialog(
      key: const Key('venta_directa_dialog'),
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900, maxHeight: 700),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              height: 2,
              color: tema.colorScheme.primary,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Text('Venta directa', style: tema.textTheme.titleLarge),
                  const Spacer(),
                  IconButton(
                    key: const Key('venta_directa_cerrar'),
                    onPressed: _cobrando ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Columna izquierda: buscador + lista de productos
                  Expanded(
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: TextField(
                            key: const Key('venta_directa_buscar'),
                            controller: _busqueda,
                            decoration: const InputDecoration(
                              labelText: 'Buscar producto',
                              prefixIcon: Icon(Icons.search),
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        Expanded(
                          child: catalogo.isLoading && !catalogo.hasValue
                              ? const Center(child: CircularProgressIndicator())
                              : catalogo.hasError
                                  ? Center(
                                      child: Text(
                                        'Error al cargar el catálogo.',
                                        textAlign: TextAlign.center,
                                      ),
                                    )
                                  : filtrados.isEmpty
                                      ? const Center(
                                          child: Text('Sin resultados.'),
                                        )
                                      : ListView.separated(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                          ),
                                          itemCount: filtrados.length,
                                          separatorBuilder: (_, _) =>
                                              const Divider(height: 1),
                                          itemBuilder: (context, index) {
                                            final p = filtrados[index];
                                            final enCarrito =
                                                _carrito[p.id] ?? 0;
                                            return ListTile(
                                              key: Key(
                                                'venta_producto_${p.id}',
                                              ),
                                              title: Text(p.nombre),
                                              subtitle: Text(
                                                '${moneda(p.precio)} / '
                                                '${p.unidadLabel}',
                                              ),
                                              trailing: enCarrito > 0
                                                  ? Row(
                                                      mainAxisSize:
                                                          MainAxisSize.min,
                                                      children: [
                                                        Text(
                                                          '×$enCarrito',
                                                          style: tema
                                                              .textTheme
                                                              .titleSmall,
                                                        ),
                                                        const SizedBox(
                                                          width: 8,
                                                        ),
                                                        IconButton(
                                                          icon: const Icon(
                                                            Icons.add,
                                                            size: 20,
                                                          ),
                                                          onPressed: () =>
                                                              _agregar(p),
                                                        ),
                                                      ],
                                                    )
                                                  : IconButton(
                                                      key: Key(
                                                        'venta_agregar_${p.id}',
                                                      ),
                                                      icon: const Icon(
                                                        Icons.add_shopping_cart,
                                                      ),
                                                      onPressed: () =>
                                                          _agregar(p),
                                                    ),
                                            );
                                          },
                                        ),
                        ),
                      ],
                    ),
                  ),
                  const VerticalDivider(width: 1),
                  // Columna derecha: carrito + cobro
                  SizedBox(
                    width: 320,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            'Carrito',
                            style: tema.textTheme.titleMedium,
                          ),
                        ),
                        Expanded(
                          child: _lineas.isEmpty
                              ? const Center(
                                  child: Text(
                                    'Agregá productos para cobrar.',
                                    textAlign: TextAlign.center,
                                  ),
                                )
                              : ListView.separated(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                  ),
                                  itemCount: _lineas.length,
                                  separatorBuilder: (_, _) =>
                                      const Divider(height: 1),
                                  itemBuilder: (context, index) {
                                    final linea = _lineas[index];
                                    return ListTile(
                                      key: Key(
                                        'venta_carrito_${linea.producto.id}',
                                      ),
                                      dense: true,
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(
                                        linea.producto.nombre,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      subtitle: Text(
                                        moneda(
                                          linea.producto.precio *
                                              linea.cantidad,
                                        ),
                                      ),
                                      trailing: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          IconButton(
                                            key: Key(
                                              'venta_menos_${linea.producto.id}',
                                            ),
                                            icon: const Icon(
                                              Icons.remove,
                                              size: 18,
                                            ),
                                            onPressed: _cobrando
                                                ? null
                                                : () => _quitar(
                                                      linea.producto.id,
                                                    ),
                                          ),
                                          SizedBox(
                                            width: 24,
                                            child: Text(
                                              '${linea.cantidad}',
                                              textAlign: TextAlign.center,
                                            ),
                                          ),
                                          IconButton(
                                            key: Key(
                                              'venta_mas_${linea.producto.id}',
                                            ),
                                            icon: const Icon(
                                              Icons.add,
                                              size: 18,
                                            ),
                                            onPressed: _cobrando
                                                ? null
                                                : () => _incrementar(
                                                      linea.producto.id,
                                                    ),
                                          ),
                                          IconButton(
                                            key: Key(
                                              'venta_eliminar_${linea.producto.id}',
                                            ),
                                            icon: const Icon(
                                              Icons.delete_outline,
                                              size: 18,
                                            ),
                                            onPressed: _cobrando
                                                ? null
                                                : () => _eliminar(
                                                      linea.producto.id,
                                                    ),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                        ),
                        const Divider(height: 1),
                        // Cliente
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                          child: clientes.value == null
                              ? const Text('Mostrador')
                              : DropdownButtonFormField<String>(
                                  key: const Key('venta_cliente'),
                                  initialValue: _clienteNombre,
                                  isExpanded: true,
                                  decoration: const InputDecoration(
                                    labelText: 'Cliente',
                                    border: OutlineInputBorder(),
                                    isDense: true,
                                  ),
                                  items: [
                                    const DropdownMenuItem(
                                      value: 'Mostrador',
                                      child: Text('Mostrador'),
                                    ),
                                    for (final c
                                        in clientes.value ?? const [])
                                      DropdownMenuItem(
                                        value: c.nombre,
                                        child: Text(c.nombre),
                                      ),
                                  ],
                                  onChanged: _cobrando
                                      ? null
                                      : (v) => setState(
                                            () =>
                                                _clienteNombre = v ?? 'Mostrador',
                                          ),
                                ),
                        ),
                        // Forma de pago
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              for (final forma in FormaPago.values)
                                ChoiceChip(
                                  key: Key(
                                    'venta_forma_${forma.apiValue}',
                                  ),
                                  label: Text(forma.label),
                                  selected: _forma == forma,
                                  onSelected: _cobrando
                                      ? null
                                      : (_) => setState(() => _forma = forma),
                                ),
                            ],
                          ),
                        ),
                        // Recibido (solo efectivo)
                        if (_forma == FormaPago.efectivo)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: TextField(
                              key: const Key('venta_recibido'),
                              controller: _recibido,
                              enabled: !_cobrando,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Recibido',
                                prefixText: '\$ ',
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        // Total y vuelto
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    'Total',
                                    style: tema.textTheme.titleLarge,
                                  ),
                                  const Spacer(),
                                  Text(
                                    moneda(_total),
                                    key: const Key('venta_total'),
                                    style: tema.textTheme.titleLarge,
                                  ),
                                ],
                              ),
                              if (_forma == FormaPago.efectivo)
                                Row(
                                  children: [
                                    Text('Vuelto', style: tema.textTheme.bodyMedium),
                                    const Spacer(),
                                    Text(
                                      _recibidoNum == null || _recibidoNum! < _total
                                          ? 'Insuficiente'
                                          : moneda(_vueltoEstimado),
                                      key: const Key('venta_vuelto'),
                                      style: tema.textTheme.bodyMedium,
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ),
                        // Error
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Material(
                              key: const Key('venta_error'),
                              color: tema.colorScheme.errorContainer,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                child: Text(
                                  _error!,
                                  style: TextStyle(
                                    color: tema.colorScheme.onErrorContainer,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        // Botón cobrar
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: FilledButton.icon(
                            key: const Key('venta_cobrar'),
                            onPressed: _puedeCobrar ? _cobrar : null,
                            icon: _cobrando
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.point_of_sale),
                            label: Text(_cobrando ? 'Cobrando...' : 'Cobrar'),
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
      ),
    );
  }
}

class _LineaCarrito {
  const _LineaCarrito({required this.producto, required this.cantidad});
  final Producto producto;
  final int cantidad;
}

/// Sentinel para cuando el producto no se encuentra en el catálogo.
const _productoVacio = Producto(
  id: '',
  nombre: '',
  unidad: '',
  unidadLabel: '',
  precio: 0,
  stock: 0,
  stockMinimo: 0,
  alias: [],
  activo: false,
  stockBajo: false,
);
