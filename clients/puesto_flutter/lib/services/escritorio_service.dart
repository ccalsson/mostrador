import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/escritorio.dart';

/// Consume GET /api/v1/escritorio — solo admin.
///
/// El backend valida el rol; si el usuario no es admin devuelve 403.
class EscritorioService {
  EscritorioService(this._client);
  final ApiClient _client;

  Future<EscritorioResumen> obtener() async {
    final data = await _client.get('/api/v1/escritorio') as Map<String, dynamic>;
    return EscritorioResumen.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final escritorioServiceProvider = Provider<EscritorioService>(
  (ref) => EscritorioService(ref.watch(apiClientProvider)),
);

final escritorioProvider = FutureProvider<EscritorioResumen>(
  (ref) => ref.watch(escritorioServiceProvider).obtener(),
);
