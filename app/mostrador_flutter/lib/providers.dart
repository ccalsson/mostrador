export 'models/egreso.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/network/api_client.dart';
import 'models/egreso.dart';
import 'services/addons_service.dart';
import 'services/egresos_service.dart';
import 'services/escritorio_service.dart';

/// Proveedor del ApiClient — configurable al arrancar la app.
final apiClientProvider = Provider<ApiClient>((ref) {
  // Por defecto apunta a localhost; la app lo sobreescribe en main.
  return ApiClient(baseUrl: 'http://localhost:8080');
});

/// Proveedor del servicio de escritorio (solo admin).
final escritorioServiceProvider = Provider<EscritorioService>((ref) {
  return EscritorioService(ref.watch(apiClientProvider));
});

/// Proveedor del servicio de add-ons (solo admin).
final addonsServiceProvider = Provider<AddonsService>((ref) {
  return AddonsService(ref.watch(apiClientProvider));
});

/// Proveedor del servicio de egresos.
final egresosServiceProvider = Provider<EgresosService>((ref) {
  return EgresosService(ref.watch(apiClientProvider));
});

/// Proveedor que mantiene la lista de egresos del turno.
final egresosTurnoProvider =
    StateNotifierProvider<EgresosTurnoNotifier, EgresosTurnoState>((ref) {
  return EgresosTurnoNotifier(ref.watch(egresosServiceProvider));
});

// ---------------------------------------------------------------------------
// State & Notifier
// ---------------------------------------------------------------------------

class EgresosTurnoState {
  const EgresosTurnoState({
    this.items = const [],
    this.totalEfectivo = 0,
    this.isLoading = false,
    this.error,
  });

  final List<Egreso> items;
  final double totalEfectivo;
  final bool isLoading;
  final String? error;

  double get totalGeneral => items.fold(0.0, (s, e) => s + e.monto);

  EgresosTurnoState copyWith({
    List<Egreso>? items,
    double? totalEfectivo,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) =>
      EgresosTurnoState(
        items: items ?? this.items,
        totalEfectivo: totalEfectivo ?? this.totalEfectivo,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
      );
}

class EgresosTurnoNotifier extends StateNotifier<EgresosTurnoState> {
  EgresosTurnoNotifier(this._service) : super(const EgresosTurnoState());

  final EgresosService _service;

  Future<void> cargar() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final turno = await _service.listar();
      state = EgresosTurnoState(
        items: turno.items,
        totalEfectivo: turno.totalEfectivo,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> agregar(Egreso egreso) async {
    try {
      await _service.crear(egreso);
      await cargar();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> actualizar(Egreso egreso) async {
    try {
      await _service.editar(egreso);
      await cargar();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> eliminar(String id) async {
    try {
      await _service.borrar(id);
      await cargar();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}
