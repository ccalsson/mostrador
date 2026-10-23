import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Servicio de detección de conectividad. Expone un stream de cambios
/// y un método para consultar el estado actual.
class ConectividadService {
  ConectividadService(this._connectivity);

  final Connectivity _connectivity;
  StreamSubscription<List<ConnectivityResult>>? _sub;

  /// Inicializa el listener de cambios de conectividad.
  void iniciar() {
    _sub = _connectivity.onConnectivityChanged.listen((resultados) {
      _actualizarEstado(resultados);
    });
  }

  void dispose() {
    _sub?.cancel();
    _sub = null;
  }

  /// Consulta el estado actual de conectividad.
  Future<bool> hayConexion() async {
    final resultados = await _connectivity.checkConnectivity();
    return _tieneConexion(resultados);
  }

  /// Callbacks para notificar cambios a los listeners.
  final List<void Function(bool)> _listeners = [];

  void addListener(void Function(bool) listener) {
    _listeners.add(listener);
  }

  void removeListener(void Function(bool) listener) {
    _listeners.remove(listener);
  }

  void _actualizarEstado(List<ConnectivityResult> resultados) {
    final conectado = _tieneConexion(resultados);
    for (final listener in _listeners) {
      listener(conectado);
    }
  }

  bool _tieneConexion(List<ConnectivityResult> resultados) {
    return resultados.any((r) =>
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.ethernet);
  }
}

/// Proveedor del servicio de conectividad.
final conectividadServiceProvider = Provider<ConectividadService>((ref) {
  final service = ConectividadService(Connectivity());
  service.iniciar();
  ref.onDispose(service.dispose);
  return service;
});
