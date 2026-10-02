import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/ids.dart';
import '../../models/cobro.dart';
import '../../services/catalogo_service.dart';
import '../../services/pedidos_service.dart';

enum CobroFase { inactiva, enviando, error, exito }

class CobroEstado {
  const CobroEstado({
    this.fase = CobroFase.inactiva,
    this.errorMensaje,
    this.resultado,
  });

  final CobroFase fase;
  final String? errorMensaje;
  final CobroResultado? resultado;

  bool get enviando => fase == CobroFase.enviando;
  bool get exito => fase == CobroFase.exito;
}

/// Cobro de un pedido (`POST /api/v1/pedidos/:id/cobrar`).
///
/// El backend es idempotente por `(tenant, clientUuid)`: un mismo intento
/// lógico reutiliza el UUID aunque falle y se reintente. El guard de
/// enviando/exito evita cobros concurrentes; tras el éxito se relee el pedido
/// del backend (nada de transiciones locales).
class CobroController extends Notifier<CobroEstado> {
  CobroController(this.pedidoId);

  final String pedidoId;
  String? _clientUuid;

  @override
  CobroEstado build() => const CobroEstado();

  Future<void> cobrar({
    required FormaPago formaPago,
    double? montoRecibido,
  }) async {
    if (state.enviando || state.exito) return;
    final clientUuid = _clientUuid ??= generarUuidV4();
    state = const CobroEstado(fase: CobroFase.enviando);
    try {
      final resultado = await ref.read(pedidosServiceProvider).cobrar(
            pedidoId,
            clientUuid: clientUuid,
            formaPago: formaPago,
            montoRecibido: montoRecibido,
          );
      if (!ref.mounted) return;
      // Refrescar desde el backend: el cobro descuenta stock y el estado del
      // pedido pasa a `cobrado` del lado del servidor.
      ref.invalidate(pedidoDetalleProvider(pedidoId));
      ref.invalidate(pedidosCajaProvider);
      ref.invalidate(catalogoProvider);
      state = CobroEstado(fase: CobroFase.exito, resultado: resultado);
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = CobroEstado(fase: CobroFase.error, errorMensaje: error.message);
    } catch (_) {
      if (!ref.mounted) return;
      state = const CobroEstado(
        fase: CobroFase.error,
        errorMensaje: 'No se pudo registrar el cobro.',
      );
    }
  }
}

final cobroControllerProvider =
    NotifierProvider.family<CobroController, CobroEstado, String>(
  CobroController.new,
);
