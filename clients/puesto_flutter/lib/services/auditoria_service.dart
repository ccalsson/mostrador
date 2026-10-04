import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/auditoria.dart';

class AuditoriaService {
  AuditoriaService(this._client);

  final ApiClient _client;

  Future<List<Auditoria>> listar() async {
    final data = await _client.get('/api/v1/auditoria') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Auditoria.fromJson(json as Map<String, dynamic>))
        .toList();
  }
}

final auditoriaServiceProvider = Provider<AuditoriaService>(
  (ref) => AuditoriaService(ref.watch(apiClientProvider)),
);

final auditoriaProvider = FutureProvider<List<Auditoria>>(
  (ref) => ref.watch(auditoriaServiceProvider).listar(),
);
