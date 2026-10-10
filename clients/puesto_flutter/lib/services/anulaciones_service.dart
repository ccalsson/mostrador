import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors/api_exceptions.dart';
import '../core/network/api_client.dart';

/// Anulaciones de pedidos y ventas contra la API v1.
class AnulacionesService {
  AnulacionesService(this._client);

  final ApiClient _client;

  /// `POST /api/v1/pedidos/:id/anular`; el backend libera reservas y aplica
  /// las reglas de stock, permisos y bloqueo por factura electrónica.
  Future<void> pedido(String id, {required String motivo}) async {
    final data = await _client.post(
      '/api/v1/pedidos/$id/anular',
      body: {'motivo': motivo},
    ) as Map<String, dynamic>;
    final pedido = data['data'] as Map<String, dynamic>?;
    if (pedido?['estado'] != 'anulado') {
      throw const ApiException(
        'El servidor no confirmó la anulación del pedido.',
      );
    }
  }

  /// `POST /api/v1/cobros/:id/anular`; el backend reintegra stock y revierte
  /// cuenta corriente cuando corresponde.
  Future<void> cobro(String id, {required String motivo}) async {
    final data = await _client.post(
      '/api/v1/cobros/$id/anular',
      body: {'motivo': motivo},
    ) as Map<String, dynamic>;
    final resultado = data['data'] as Map<String, dynamic>?;
    if (resultado?['ok'] != true) {
      throw const ApiException(
        'El servidor no confirmó la anulación de la venta.',
      );
    }
  }
}

final anulacionesServiceProvider = Provider<AnulacionesService>(
  (ref) => AnulacionesService(ref.watch(apiClientProvider)),
);
