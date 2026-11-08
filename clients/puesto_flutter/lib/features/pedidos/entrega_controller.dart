import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/pedidos_service.dart';

enum EntregaFase { inactiva, enviando, error, exito }

class EntregaEstado {
  const EntregaEstado({this.fase = EntregaFase.inactiva, this.errorMensaje});

  final EntregaFase fase;
  final String? errorMensaje;

  bool get enviando => fase == EntregaFase.enviando;
  bool get exito => fase == EntregaFase.exito;
}

/// Línea de entrega con la cantidad que se va a entregar y una nota opcional.
class EntregaLinea {
  const EntregaLinea({
    required this.itemId,
    required this.cantidad,
    this.nota = '',
  });

  final String itemId;
  final double cantidad;
  final String nota;
}

/// Entrega de un pedido (`POST /api/v1/pedidos/:id/entregar` o
/// `POST /api/v1/pedidos/:id/entregar-parcial`).
///
/// El backend sólo acepta pedidos `cobrado` y no es idempotente: un segundo
/// envío responde 400. El guard de [EntregaEstado.enviando]/[exito] evita
/// pedidos concurrentes; tras el éxito se re-lee el detalle del backend.
///
/// Soporta dos modos:
/// - **Total** (`entregar`): marca todo como entregado.
/// - **Parcial** (`entregarParcial`): entrega solo los ítems indicados.
class EntregaController extends Notifier<EntregaEstado> {
  EntregaController(this.pedidoId);

  final String pedidoId;

  @override
  EntregaEstado build() => const EntregaEstado();

  /// Entrega total: marca todos los ítems como entregados.
  Future<void> entregar() async {
    if (state.enviando || state.exito) return;
    state = const EntregaEstado(fase: EntregaFase.enviando);
    try {
      await ref.read(pedidosServiceProvider).entregar(pedidoId);
      if (!ref.mounted) return;
      // Refrescar desde el backend: nada de mutación optimista.
      ref.invalidate(pedidoDetalleProvider(pedidoId));
      ref.invalidate(pedidosColaProvider);
      state = const EntregaEstado(fase: EntregaFase.exito);
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = EntregaEstado(fase: EntregaFase.error, errorMensaje: error.message);
    } catch (_) {
      if (!ref.mounted) return;
      state = const EntregaEstado(
        fase: EntregaFase.error,
        errorMensaje: 'No se pudo entregar el pedido.',
      );
    }
  }

  /// Entrega parcial: envía solo las [lineas] indicadas. Debe haber al menos
  /// una línea con cantidad > 0. El backend valida que no se supere lo
  /// pendiente por ítem.
  Future<void> entregarParcial(List<EntregaLinea> lineas) async {
    if (state.enviando || state.exito) return;
    if (lineas.isEmpty) {
      state = const EntregaEstado(
        fase: EntregaFase.error,
        errorMensaje: 'Seleccioná al menos un ítem para entregar.',
      );
      return;
    }
    state = const EntregaEstado(fase: EntregaFase.enviando);
    try {
      await ref.read(pedidosServiceProvider).entregarParcial(
            pedidoId,
            items: [
              for (final l in lineas)
                (itemId: l.itemId, cantidad: l.cantidad, nota: l.nota),
            ],
          );
      if (!ref.mounted) return;
      ref.invalidate(pedidoDetalleProvider(pedidoId));
      ref.invalidate(pedidosColaProvider);
      state = const EntregaEstado(fase: EntregaFase.exito);
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = EntregaEstado(fase: EntregaFase.error, errorMensaje: error.message);
    } catch (_) {
      if (!ref.mounted) return;
      state = const EntregaEstado(
        fase: EntregaFase.error,
        errorMensaje: 'No se pudo entregar el pedido.',
      );
    }
  }
}

final entregaControllerProvider =
    NotifierProvider.family<EntregaController, EntregaEstado, String>(
  EntregaController.new,
);
