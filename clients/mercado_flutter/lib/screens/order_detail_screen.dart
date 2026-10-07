import 'dart:async';

import 'package:flutter/material.dart';

import '../market_api.dart';
import '../models.dart';
import '../widgets/common.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({
    required this.api,
    required this.pedidoId,
    super.key,
  });

  final MercadoApi api;
  final String pedidoId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  static const _estadosFinales = {
    EstadoPedidoComprador.entregado,
    EstadoPedidoComprador.cancelado,
  };

  late final Timer _timer;
  PedidoComprador? _pedido;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final actual = _pedido;
    if (actual != null && _estadosFinales.contains(actual.estado)) {
      _timer.cancel();
      return;
    }
    try {
      final pedido = await widget.api.obtenerPedidoComprador(widget.pedidoId);
      if (!mounted) return;
      setState(() {
        _pedido = pedido;
        _error = null;
        _loading = false;
      });
      if (_estadosFinales.contains(pedido.estado)) _timer.cancel();
    } catch (error) {
      if (!mounted) return;
      // Con un pedido ya visible, un reintento fallido no borra lo último
      // conocido; el panel de error sólo aparece si nunca hubo datos.
      if (_pedido == null) {
        setState(() {
          _error = error;
          _loading = false;
        });
      }
    }
  }

  String _cuando(String iso) =>
      iso.length >= 16 ? '${iso.substring(0, 10)} ${iso.substring(11, 16)}' : iso;

  @override
  Widget build(BuildContext context) {
    final pedido = _pedido;
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (pedido == null) {
      return Scaffold(
        appBar: AppBar(),
        body: ErrorPanel(error: _error, onRetry: _load),
      );
    }
    final tiempos = <String>[
      if (pedido.tiempos.preparacion != null)
        'Preparación ${pedido.tiempos.preparacion} min',
      if (pedido.tiempos.espera != null) 'Espera ${pedido.tiempos.espera} min',
      if (pedido.tiempos.entrega != null)
        'Entrega ${pedido.tiempos.entrega} min',
      if (pedido.tiempos.total != null) 'Total ${pedido.tiempos.total} min',
    ];
    final hitos = <(String, String?)>[
      ('Pedido creado', pedido.createdAt),
      ('Confirmado', pedido.confirmedAt),
      ('En preparación', pedido.preparationStartedAt),
      ('Preparado', pedido.preparedAt),
      ('Retirado', pedido.pickedUpAt),
      ('Entregado', pedido.deliveredAt),
    ];
    return Scaffold(
      appBar: AppBar(title: Text('Pedido Nº ${pedido.id}')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            Card(
              margin: const EdgeInsets.symmetric(horizontal: 12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            pedido.puesto,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        Chip(label: Text(pedido.estado.label)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Total: ${money(pedido.total)} · '
                      '${quantity(pedido.bultos)} bultos',
                    ),
                    if (pedido.nota.isNotEmpty) Text('Nota: ${pedido.nota}'),
                    if (pedido.medioPago.isNotEmpty)
                      Text('Pago: ${pedido.medioPago} (${pedido.pagoEstado})'),
                  ],
                ),
              ),
            ),
            if (tiempos.isNotEmpty)
              Card(
                margin: const EdgeInsets.symmetric(horizontal: 12),
                child: ListTile(
                  leading: const Icon(Icons.schedule_outlined),
                  title: const Text('Tiempos estimados'),
                  subtitle: Text(tiempos.join(' · ')),
                ),
              ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text('Productos'),
            ),
            for (final linea in pedido.items)
              ListTile(
                title: Text(linea.nombre),
                subtitle: Text(
                  '${quantity(linea.cantidad)} ${linea.unidadLabel} × '
                  '${money(linea.precioUnitario)}',
                ),
                trailing: Text(money(linea.subtotal)),
              ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text('Seguimiento'),
            ),
            for (final (titulo, momento) in hitos)
              if (momento != null && momento.isNotEmpty)
                ListTile(
                  dense: true,
                  leading: const Icon(
                    Icons.check_circle_outline,
                    size: 20,
                  ),
                  title: Text(titulo),
                  subtitle: Text(_cuando(momento)),
                ),
          ],
        ),
      ),
    );
  }
}
