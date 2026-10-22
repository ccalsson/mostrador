import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/egreso.dart';

class EgresosService {
  EgresosService(this._client);

  final ApiClient _client;

  Future<List<Egreso>> listar() async {
    final data = await _client.get('/api/v1/egresos') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((e) => Egreso.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> crear({
    required double monto,
    required String concepto,
    String? categoria,
  }) async {
    await _client.post('/api/v1/egresos', body: {
      'monto': monto,
      'concepto': concepto,
      'categoria': categoria ?? 'gasto',
    });
  }

  Future<void> anular(String id) async {
    await _client.post('/api/v1/egresos/$id/anular');
  }
}

final egresosServiceProvider =
    Provider<EgresosService>((ref) => EgresosService(ref.watch(apiClientProvider)));

final egresosProvider = FutureProvider<List<Egreso>>(
  (ref) => ref.watch(egresosServiceProvider).listar(),
);
