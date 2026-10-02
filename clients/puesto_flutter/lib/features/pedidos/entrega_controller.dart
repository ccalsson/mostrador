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

/// Entrega de un pedido (`POST /api/v1/pedidos/:id/entregar`).
///
/// El backend sólo acepta pedidos `cobrado` y no es idempotente: un segundo
/// envío responde 400. El guard de [EntregaEstado.enviando]/[exito] evita
/// pedidos concurrentes; tras el éxito se re-lee el detalle del backend.
class EntregaController extends Notifier<EntregaEstado> {
  EntregaController(this.pedidoId);

  final String pedidoId;

  @override
  EntregaEstado build() => const EntregaEstado();

  Future<void> entregar() async {
    if (state.enviando || state.exito) return;
    state = const EntregaEstado(fase: EntregaFase.enviando);
    try {
      await ref.read(pedidosServiceProvider).entregar(pedidoId);
      if (!ref.mounted) return;
      // Refrescar desde el backend: nada de mutación optimista.
      ref.invalidate(pedidoDetalleProvider(pedidoId));
      ref.invalidate(pedidosMineProvider);
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
