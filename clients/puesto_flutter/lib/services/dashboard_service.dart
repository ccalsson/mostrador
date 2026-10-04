import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/dashboard.dart';

/// Datos del dashboard para el tablero del admin (`GET /api/v1/dashboard`).
class DashboardService {
  DashboardService(this._client);

  final ApiClient _client;

  /// [dias] acota el período (1, 7, 30…). `null` = hoy (default del backend).
  Future<DashboardResumen> obtener({int? dias}) async {
    final query = dias != null ? {'dias': '$dias'} : null;
    final data = await _client.get('/api/v1/dashboard', query: query)
        as Map<String, dynamic>;
    return DashboardResumen.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final dashboardServiceProvider = Provider<DashboardService>(
  (ref) => DashboardService(ref.watch(apiClientProvider)),
);

/// [_DashboardParams] encapsula el período para que el provider pueda
/// recibir parámetros sin necesidad de `family` de Riverpod.
class _DashboardParams {
  const _DashboardParams(this.dias);
  final int dias;

  @override
  bool operator ==(Object other) =>
      other is _DashboardParams && other.dias == dias;

  @override
  int get hashCode => dias.hashCode;
}

/// Provider de estado para el período elegido en el dashboard.
class DashboardDias extends Notifier<int> {
  @override
  int build() => 1;

  void setDias(int dias) => state = dias;
}

final dashboardDiasProvider =
    NotifierProvider<DashboardDias, int>(DashboardDias.new);

/// Provider que deriva el resumen del dashboard según el período seleccionado.
final dashboardProvider = FutureProvider<DashboardResumen>((ref) {
  final dias = ref.watch(dashboardDiasProvider);
  return ref.watch(dashboardServiceProvider).obtener(dias: dias);
});
