import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/reportes.dart';

/// Servicio de reportes y ranking (`/api/v1/reportes/*` y `/api/v1/cargadores/ranking`).
class ReportesService {
  ReportesService(this._client);

  final ApiClient _client;

  /// Resumen de ventas por producto (últimos 7 y 30 días).
  Future<ReporteProductosResumen> obtenerProductos() async {
    final data = await _client.get('/api/v1/reportes/productos')
        as Map<String, dynamic>;
    return ReporteProductosResumen.fromJson(
      data['data'] as Map<String, dynamic>,
    );
  }

  /// Historial diario de un producto en los últimos 7 días.
  Future<HistorialProducto> obtenerHistorialProducto(String productoId) async {
    final data = await _client.get(
      '/api/v1/reportes/productos/$productoId/historial',
    ) as Map<String, dynamic>;
    return HistorialProducto.fromJson(
      data['data'] as Map<String, dynamic>,
    );
  }

  /// Ranking de cargadores activos según entregas y score de Mercado.
  Future<RankingCargadores> obtenerRankingCargadores() async {
    final data = await _client.get('/api/v1/cargadores/ranking')
        as Map<String, dynamic>;
    return RankingCargadores.fromJson(
      data['data'] as Map<String, dynamic>,
    );
  }
}

final reportesServiceProvider = Provider<ReportesService>(
  (ref) => ReportesService(ref.watch(apiClientProvider)),
);

final reporteProductosProvider = FutureProvider<ReporteProductosResumen>(
  (ref) => ref.watch(reportesServiceProvider).obtenerProductos(),
);

final historialProductoProvider =
    FutureProvider.family<HistorialProducto, String>(
  (ref, productoId) =>
      ref.watch(reportesServiceProvider).obtenerHistorialProducto(productoId),
);

final rankingCargadoresProvider = FutureProvider<RankingCargadores>(
  (ref) => ref.watch(reportesServiceProvider).obtenerRankingCargadores(),
);
