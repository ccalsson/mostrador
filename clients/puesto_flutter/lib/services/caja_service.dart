import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/caja.dart';

/// Turno de caja contra la API v1. El backend es la única fuente de verdad:
/// calcula esperado, diferencia, alertas y el turno nuevo al cerrar.
class CajaService {
  CajaService(this._client);

  final ApiClient _client;

  /// `GET /api/v1/caja`, admin/cajero. El backend abre el turno si no había
  /// uno abierto y devuelve el estado real (totales y últimos cobros).
  Future<CajaEstado> estado() async {
    final data = await _client.get('/api/v1/caja') as Map<String, dynamic>;
    return CajaEstado.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// `POST /api/v1/caja/cerrar`, admin/cajero. Envía el total contado
  /// (`real`) y nota opcional; el backend cierra el turno, alerta si hay
  /// diferencia y abre un turno nuevo. Devuelve el cálculo del servidor.
  Future<CierreCajaResultado> cerrarCaja({
    required String id,
    required double real,
    String? notas,
  }) async {
    final texto = notas?.trim() ?? '';
    final data = await _client.post('/api/v1/caja/cerrar', body: {
      'id': id,
      'real': real,
      if (texto.isNotEmpty) 'notas': texto,
    }) as Map<String, dynamic>;
    return CierreCajaResultado.fromJson(data['data'] as Map<String, dynamic>);
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
