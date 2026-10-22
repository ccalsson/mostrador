import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/escritorio.dart';

class EscritorioService {
  EscritorioService(this._client);

  final ApiClient _client;

  Future<EscritorioDueno> obtener() async {
    final data = await _client.get('/api/v1/escritorio') as Map<String, dynamic>;
    return EscritorioDueno.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final escritorioServiceProvider = Provider<EscritorioService>(
  (ref) => EscritorioService(ref.watch(apiClientProvider)),
);

final escritorioProvider = FutureProvider<EscritorioDueno>((ref) {
  return ref.watch(escritorioServiceProvider).obtener();
});
