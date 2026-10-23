import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/reposicion.dart';

/// Servicio de reposición (`/api/v1/reposicion`).
/// Calcula qué productos conviene comprar según el historial de ventas.
class ReposicionService {
  ReposicionService(this._client);

  final ApiClient _client;

  /// Obtiene sugerencias de reposición.
  ///
  /// [dias] cuántos días de historial analizar (default 7).
  /// [stockMinimo] umbral mínimo para incluir un producto (default 5).
  Future<ReposicionResultado> obtener({
    int dias = 7,
    int stockMinimo = 5,
  }) async {
    final data = await _client.get(
      '/api/v1/reposicion',
      query: {
        'dias': dias.toString(),
        'stock_minimo': stockMinimo.toString(),
      },
    ) as Map<String, dynamic>;
    return ReposicionResultado.fromJson(
      data['data'] as Map<String, dynamic>,
    );
  }
}

final reposicionServiceProvider = Provider<ReposicionService>(
  (ref) => ReposicionService(ref.watch(apiClientProvider)),
);

final reposicionProvider =
    FutureProvider.family<ReposicionResultado, int>((ref, dias) {
  return ref
      .watch(reposicionServiceProvider)
      .obtener(dias: dias);
});
