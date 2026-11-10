import 'dart:async';

import 'package:flutter/widgets.dart';

/// Relee un provider y espera a que termine el request. El error no se
/// relanza: el `AsyncValue` del propio provider ya lo muestra en pantalla con
/// su botón "Reintentar", y soltar la excepción acá dejaría un `Future` sin
/// cerrar en el aire.
Future<T?> releer<T>(Future<T> Function() leer) async {
  try {
    return await leer();
  } catch (_) {
    return null;
  }
}

/// Sondeo de las pantallas que no son la cola de pedidos: caja (fuera de la
/// cola), alertas, mensajes, catálogo e informes. La cola se sondea más corto
/// porque es lo que el puesto mira a cada instante.
const Duration kSondeoLento = Duration(seconds: 15);

/// Sondeo de lo que cambia poco o cuesta más leer. Caja usa este: lo que se
/// cobra o se anula en el mostrador llega igual de rápido que un turno.
const Duration kSondeoMuyLento = Duration(seconds: 30);

/// Refresco automático de una pantalla operativa: un `Timer.periodic` más un
/// refresco inmediato cuando la app vuelve del fondo.
///
/// Cada pantalla lo expone como parámetro `intervalo` de su constructor y lo
/// reenvía acá; `null` congela el sondeo, como `ColaPedidos.intervalo`, para
/// que los widget tests no dejen un `Timer.periodic` pendiente.
///
/// El alta y la baja del `AppLifecycleListener` corren solas con el ciclo de
/// vida del `State`, así que ninguna pantalla registra observadores que haya
/// que olvidar limpiar.
///
/// Todo el refresco —sondeo, botón manual y pull-to-refresh— entra por
/// [sondeoAhora], que pone dos frenos:
///
/// - **no superpone**: si un request sigue en vuelo, el tick siguiente devuelve
///   ese mismo `Future` en lugar de tirar una ida nueva. Sin esto, un backend
///   lento convierte el sondeo en una pila de requests concurrentes.
/// - **se suspende** mientras [pausarSondeo] sea `true` (un diálogo abierto o
///   un cobro en envío). El tick caído se recuerda con [_pendiente] y se
///   recupera **uno** solo al reanudar, no todos los que se perdieron.
mixin RefrescoAutomatico<T extends StatefulWidget> on State<T> {
  /// Intervalo del sondeo; `null` lo deja congelado.
  Duration? get intervalo;

  /// Recarga real de la pantalla. Debe devolver el `Future` del request para
  /// que el mixin sepa cuándo terminó y no lo superponga con el siguiente.
  Future<void> refrescar();

  /// `true` suspende el sondeo mientras dure la pausa.
  bool get pausarSondeo => false;

  Future<void>? _enVuelo;
  bool _pendiente = false;
  Timer? _sondeo;
  AppLifecycleListener? _ciclo;

  @override
  void initState() {
    super.initState();
    _ciclo = AppLifecycleListener(onResume: _alVolver);
    final paso = intervalo;
    if (paso != null) {
      _sondeo = Timer.periodic(paso, (_) => _alVolver());
    }
  }

  @override
  void dispose() {
    _sondeo?.cancel();
    _sondeo = null;
    _ciclo?.dispose();
    _ciclo = null;
    super.dispose();
  }

  /// Entrada única al refresco. Si ya hay un request en vuelo devuelve ese
  /// `Future` (así el pull-to-refresh espera lo que estaba pasando en vez de
  /// sumar una ida más); si la pantalla está pausada pospone el tick.
  Future<void> sondeoAhora() {
    final enVuelo = _enVuelo;
    if (enVuelo != null) return enVuelo;
    if (pausarSondeo) {
      _pendiente = true;
      return Future<void>.value();
    }
    return _correr();
  }

  /// Llamada por la pantalla cuando termina lo que suspendía el sondeo: si
  /// algún tick cayó en la pausa, se refresca una sola vez.
  void reanudarSondeo() {
    if (!_pendiente) return;
    _pendiente = false;
    sondeoAhora();
  }

  Future<void> _correr() async {
    final tarea = refrescar();
    _enVuelo = tarea;
    try {
      await tarea;
    } finally {
      _enVuelo = null;
    }
  }

  void _alVolver() {
    if (!mounted) return;
    sondeoAhora();
  }
}
