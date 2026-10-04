import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/alerta.dart';

/// Alertas del tablero (`GET /api/v1/alertas` — últimas 30, no leídas
/// primero).
class AlertasService {
  AlertasService(this._client);

  final ApiClient _client;

  Future<List<Alerta>> listar() async {
    final data = await _client.get('/api/v1/alertas') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Alerta.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// `POST /api/v1/alertas/{id}/leida`, sin cuerpo.
  Future<void> marcarLeida(String id) async {
    await _client.post('/api/v1/alertas/$id/leida');
  }
}

final alertasServiceProvider =
    Provider<AlertasService>((ref) => AlertasService(ref.watch(apiClientProvider)));

final alertasProvider = FutureProvider<List<Alerta>>(
  (ref) => ref.watch(alertasServiceProvider).listar(),
);
