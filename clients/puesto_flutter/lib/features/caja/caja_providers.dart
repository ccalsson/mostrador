import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';

/// Controla si los montos se muestran normalmente o se ocultan con "·····".
/// Por defecto se muestran (true).
class MostrarMontosController extends Notifier<bool> {
  @override
  bool build() => true;

  void alternar() => state = !state;
}

final mostrarMontosProvider =
    NotifierProvider<MostrarMontosController, bool>(MostrarMontosController.new);

/// Pedidos de caja filtrados por estado (`GET /api/v1/pedidos?estados=…`).
final pedidosCajaProvider =
    FutureProvider.family<List<Pedido>, String?>(
  (ref, estados) => ref.watch(pedidosServiceProvider).listar(estados: estados),
);
