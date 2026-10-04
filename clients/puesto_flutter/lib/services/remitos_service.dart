import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/remito.dart';

class RemitosService {
  RemitosService(this._client);

  final ApiClient _client;

  Future<List<Remito>> listar() async {
    final data = await _client.get('/api/v1/remitos') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Remito.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<Remito> obtener(String id) async {
    final data = await _client.get('/api/v1/remitos/$id') as Map<String, dynamic>;
    return Remito.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<void> actualizarItem({
    required String id,
    required String? productoId,
    required double cantidad,
    required bool confirmado,
  }) async {
    await _client.post(
      '/api/v1/remitos/items',
      body: {
        'id': id,
        'productoId': productoId,
        'cantidad': cantidad,
        'confirmado': confirmado,
      },
    );
  }

  Future<void> confirmar(String remitoId) async {
    await _client.post('/api/v1/remitos/$remitoId/confirmar');
  }
}

final remitosServiceProvider = Provider<RemitosService>(
  (ref) => RemitosService(ref.watch(apiClientProvider)),
);

final remitosProvider = FutureProvider<List<Remito>>(
  (ref) => ref.watch(remitosServiceProvider).listar(),
);

final remitoProvider = FutureProvider.family<Remito, String>(
  (ref, id) => ref.watch(remitosServiceProvider).obtener(id),
);
