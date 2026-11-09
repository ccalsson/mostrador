import 'dart:async';

import 'package:flutter/widgets.dart';

/// Sondeo de las pantallas que no son la cola de pedidos: caja (fuera de la
/// cola), alertas, mensajes, catálogo e informes. La cola se sondea más corto
/// porque es lo que el puesto mira a cada instante.
const Duration kSondeoLento = Duration(seconds: 15);

/// Sondeo de lo que cambia poco o cuesta más leer.
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
mixin RefrescoAutomatico<T extends StatefulWidget> on State<T> {
  /// Intervalo del sondeo; `null` lo deja congelado.
  Duration? get intervalo;

  /// invalidate del provider que alimenta la pantalla.
  void refrescar();

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

  void _alVolver() {
    if (!mounted) return;
    refrescar();
  }
}
