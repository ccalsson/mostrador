import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/canal_mercado.dart';

class CanalMercadoService {
  CanalMercadoService(this._client);

  final ApiClient _client;

  Future<CanalMercado> obtener() async {
    final data =
        await _client.get('/api/v1/canal-mercado') as Map<String, dynamic>;
    return CanalMercado.fromJson(data);
  }

  Future<void> guardar(bool activo) async {
    await _client.post('/api/v1/canal-mercado', body: {'activo': activo});
  }
}

final canalMercadoServiceProvider = Provider<CanalMercadoService>(
  (ref) => CanalMercadoService(ref.watch(apiClientProvider)),
);

final canalMercadoProvider = FutureProvider<CanalMercado>(
  (ref) => ref.watch(canalMercadoServiceProvider).obtener(),
);
