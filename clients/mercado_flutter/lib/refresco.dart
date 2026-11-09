import 'dart:async';

import 'package:flutter/widgets.dart';

/// Intervalos del refresco automático por pantalla. [Duration.zero] apaga el
/// sondeo: así lo desactivan las pruebas y cualquier llamada que no lo quiera.
const refrescoDetalle = Duration(seconds: 10);
const refrescoRecorridos = Duration(seconds: 15);
const refrescoPedidos = Duration(seconds: 20);
const refrescoPuestos = Duration(seconds: 45);

/// Sondeo de las listas que cambian solas: timer periódico, recarga al volver
/// la app a primer plano y una única recarga en vuelo.
class Refrescador {
  Refrescador({required this.intervalo, required this.onRefresco}) {
    _ciclo = AppLifecycleListener(onResume: () => ejecutar());
    if (intervalo > Duration.zero) {
      _timer = Timer.periodic(intervalo, (_) => ejecutar());
    }
  }

  final Duration intervalo;
  final Future<void> Function() onRefresco;

  Timer? _timer;
  AppLifecycleListener? _ciclo;
  bool _enCurso = false;

  /// Entrada compartida por el sondeo, el pull-to-refresh y el reintento: si
  /// ya hay una recarga en vuelo devuelve sin apilar otra petición.
  Future<void> ejecutar() async {
    if (_enCurso) return;
    _enCurso = true;
    try {
      await onRefresco();
    } catch (_) {
      // El ErrorPanel de cada pantalla ya muestra el fallo.
    } finally {
      _enCurso = false;
    }
  }

  /// Apaga timer y listener; queda idempotente para poder llamarlo desde
  /// dispose aunque la pantalla ya lo haya detenido antes.
  void detener() {
    _timer?.cancel();
    _timer = null;
    _ciclo?.dispose();
    _ciclo = null;
  }
}
