import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors/api_exceptions.dart';
import '../core/network/api_client.dart';
import '../models/cobro.dart';
import '../models/pedido.dart';
import '../models/ticket.dart';

/// Pedidos y cobros contra la API v1. La idempotencia la garantiza el backend
/// con `(tenant_id, client_uuid)`: reenviar el mismo `clientUuid` devuelve el
/// pedido o cobro ya creado en lugar de duplicarlo.
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

  /// `POST /api/v1/pedidos/:id/entregar`, sin cuerpo. El backend sólo lo
  /// permite si el pedido está `cobrado`; no es idempotente (repetir → 400).
  Future<void> entregar(String id) async {
    final data =
        await _client.post('/api/v1/pedidos/$id/entregar') as Map<String, dynamic>;
    final ok = (data['data'] as Map<String, dynamic>?)?['ok'] == true;
    if (!ok) throw const ApiException('El servidor no confirmó la entrega.');
  }

  /// `mine: true` limita a los pedidos del vendedor autenticado;
  /// `estados` es la lista separada por comas del contrato (`?estados=a,b`).
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async {
    final data = await _client.get(
      '/api/v1/pedidos',
      query: {
        if (mine) 'mine': '1',
        'estados': ?estados,
      },
    ) as Map<String, dynamic>;
    return [
      for (final item in data['data'] as List)
        Pedido.fromJson(item as Map<String, dynamic>),
    ];
  }

  /// `POST /api/v1/pedidos/:id/cobrar`. Idempotente por `clientUuid`: repetir
  /// el mismo devuelve el cobro ya registrado. `montoRecibido` sólo viaja con
  /// efectivo; el backend calcula el vuelto.
  Future<CobroResultado> cobrar(
    String id, {
    required String clientUuid,
    required FormaPago formaPago,
    double? montoRecibido,
  }) async {
    final data = await _client.post('/api/v1/pedidos/$id/cobrar', body: {
      'clientUuid': clientUuid,
      'formaPago': formaPago.apiValue,
      'montoRecibido': ?montoRecibido,
    }) as Map<String, dynamic>;
    return CobroResultado.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// `POST /api/v1/pedidos/:id/items`: reemplaza los ítems con los precios
  /// vigentes del catálogo; el backend recalcula y devuelve el pedido.
  Future<Pedido> actualizarItems(
    String id,
    List<({String productoId, double cantidad})> items,
  ) async {
    final data = await _client.post('/api/v1/pedidos/$id/items', body: {
      'items': [
        for (final item in items)
          {'productoId': item.productoId, 'cantidad': item.cantidad},
      ],
    }) as Map<String, dynamic>;
    return _pedidoDe(data);
  }

  /// `GET /api/v1/cobros/:id/ticket`.
  Future<Ticket> ticket(String cobroId) async {
    final data =
        await _client.get('/api/v1/cobros/$cobroId/ticket') as Map<String, dynamic>;
    return Ticket.fromJson(data['data'] as Map<String, dynamic>);
  }

  Pedido _pedidoDe(Map<String, dynamic> data) =>
      Pedido.fromJson(data['data'] as Map<String, dynamic>);
}

final pedidosServiceProvider =
    Provider<PedidosService>((ref) => PedidosService(ref.watch(apiClientProvider)));

/// Sin reintentos automáticos: el error debe verse al instante y la UI
/// ofrece "Reintentar" explícito.
Duration? _sinReintentos(int retryCount, Object error) => null;

final pedidoDetalleProvider = FutureProvider.family<Pedido, String>(
  (ref, id) => ref.watch(pedidosServiceProvider).detalle(id),
  retry: _sinReintentos,
);

/// Pedidos del vendedor autenticado (`GET /api/v1/pedidos?mine=1`).
final pedidosMineProvider = FutureProvider<List<Pedido>>(
  (ref) => ref.watch(pedidosServiceProvider).listar(mine: true),
  retry: _sinReintentos,
);

/// Pedidos para caja filtrados por estado. El argumento es la lista separada
/// por comas tal cual la espera el contrato; `null` = todos.
final pedidosCajaProvider = FutureProvider.family<List<Pedido>, String?>(
  (ref, estados) => ref.watch(pedidosServiceProvider).listar(estados: estados),
  retry: _sinReintentos,
);

/// Ticket de un cobro (`GET /api/v1/cobros/:id/ticket`).
final ticketProvider = FutureProvider.family<Ticket, String>(
  (ref, cobroId) => ref.watch(pedidosServiceProvider).ticket(cobroId),
  retry: _sinReintentos,
);
