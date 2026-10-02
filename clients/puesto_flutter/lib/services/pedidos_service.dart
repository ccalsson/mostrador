import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/pedido.dart';

/// Pedidos contra la API v1. La idempotencia la garantiza el backend con
/// `(tenant_id, client_uuid)`: reenviar el mismo `clientUuid` devuelve el
/// pedido ya creado en lugar de duplicarlo.
class PedidosService {
  PedidosService(this._client);

  final ApiClient _client;

  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? nota,
  }) async {
    final data = await _client.post('/api/v1/pedidos', body: {
      'clientUuid': clientUuid,
      'clienteNombre': clienteNombre,
      'nota': ?nota,
      'items': [
        for (final item in items)
          {'productoId': item.productoId, 'cantidad': item.cantidad},
      ],
    }) as Map<String, dynamic>;
    return _pedidoDe(data);
  }

  Future<Pedido> detalle(String id) async {
    final data = await _client.get('/api/v1/pedidos/$id') as Map<String, dynamic>;
    return _pedidoDe(data);
  }

  /// `mine: true` limita a los pedidos del vendedor autenticado.
  Future<List<Pedido>> listar({bool mine = false}) async {
    final data = await _client.get(
      '/api/v1/pedidos',
      query: {if (mine) 'mine': '1'},
    ) as Map<String, dynamic>;
    return [
      for (final item in data['data'] as List)
        Pedido.fromJson(item as Map<String, dynamic>),
    ];
  }

  Pedido _pedidoDe(Map<String, dynamic> data) =>
      Pedido.fromJson(data['data'] as Map<String, dynamic>);
}

final pedidosServiceProvider =
    Provider<PedidosService>((ref) => PedidosService(ref.watch(apiClientProvider)));

final pedidoDetalleProvider = FutureProvider.family<Pedido, String>(
  (ref, id) => ref.watch(pedidosServiceProvider).detalle(id),
);
