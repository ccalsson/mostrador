import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/mesa_turno.dart';

/// Mesa del turno contra la API v1 (`GET /api/v1/mesa-turno`).
///
/// Devuelve los 5 indicadores compactos que se muestran en la barra
/// superior del shell para roles admin y cajero.
class MesaTurnoService {
  MesaTurnoService(this._client);

  final ApiClient _client;

  Future<MesaTurno> obtener() async {
    final data =
        await _client.get('/api/v1/mesa-turno') as Map<String, dynamic>;
    return MesaTurno.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final mesaTurnoServiceProvider = Provider<MesaTurnoService>(
  (ref) => MesaTurnoService(ref.watch(apiClientProvider)),
);

/// Sin reintentos automáticos: el error debe verse al instante y la UI
/// ofrece "Reintentar" explícito.
Duration? _sinReintentos(int retryCount, Object error) => null;

/// Indicadores de la mesa del turno. Se invalida manualmente para refresh.
final mesaTurnoProvider = FutureProvider<MesaTurno>(
  (ref) => ref.watch(mesaTurnoServiceProvider).obtener(),
  retry: _sinReintentos,
);
