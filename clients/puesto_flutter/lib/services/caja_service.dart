import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/caja.dart';

/// Estado del turno de caja contra la API v1. Sólo lectura: el cierre de caja
/// (`POST /api/v1/caja/cerrar`) no forma parte de esta fase.
class CajaService {
  CajaService(this._client);

  final ApiClient _client;

  /// `GET /api/v1/caja`, admin/cajero. El backend abre el turno si no había
  /// uno abierto y devuelve el estado real (totales y últimos cobros).
  Future<CajaEstado> estado() async {
    final data = await _client.get('/api/v1/caja') as Map<String, dynamic>;
    return CajaEstado.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final cajaServiceProvider =
    Provider<CajaService>((ref) => CajaService(ref.watch(apiClientProvider)));

/// Sin reintentos automáticos: el error debe verse al instante y la UI
/// ofrece "Reintentar" explícito.
Duration? _sinReintentos(int retryCount, Object error) => null;

final cajaEstadoProvider = FutureProvider<CajaEstado>(
  (ref) => ref.watch(cajaServiceProvider).estado(),
  retry: _sinReintentos,
);
