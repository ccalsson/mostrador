import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/pedido.dart';
import '../../services/pedidos_service.dart';

enum EdicionFase { inactiva, guardando, error, exito }

class EdicionEstado {
  const EdicionEstado({this.fase = EdicionFase.inactiva, this.errorMensaje, this.pedido});

  final EdicionFase fase;
  final String? errorMensaje;

  /// Pedido devuelto por el backend tras reemplazar los ítems.
  final Pedido? pedido;

  bool get guardando => fase == EdicionFase.guardando;
  bool get exito => fase == EdicionFase.exito;
}

/// Edición de ítems de un pedido (`POST /api/v1/pedidos/:id/items`).
///
/// El backend reemplaza los ítems con los precios vigentes del catálogo y
/// devuelve el pedido recalculado: el total definitivo sale de ahí, nunca de
/// un cálculo local.
class EdicionItemsController extends Notifier<EdicionEstado> {
  EdicionItemsController(this.pedidoId);

  final String pedidoId;

  @override
  EdicionEstado build() => const EdicionEstado();

  Future<void> guardar(List<({String productoId, double cantidad})> items) async {
    if (state.guardando || state.exito) return;
    state = const EdicionEstado(fase: EdicionFase.guardando);
    try {
      final pedido =
          await ref.read(pedidosServiceProvider).actualizarItems(pedidoId, items);
      if (!ref.mounted) return;
      ref.invalidate(pedidoDetalleProvider(pedidoId));
      ref.invalidate(pedidosCajaProvider);
      state = EdicionEstado(fase: EdicionFase.exito, pedido: pedido);
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = EdicionEstado(fase: EdicionFase.error, errorMensaje: error.message);
    } catch (_) {
      if (!ref.mounted) return;
      state = const EdicionEstado(
        fase: EdicionFase.error,
        errorMensaje: 'No se pudieron actualizar los ítems.',
      );
    }
  }
}

final edicionItemsControllerProvider =
    NotifierProvider.family<EdicionItemsController, EdicionEstado, String>(
  EdicionItemsController.new,
);
