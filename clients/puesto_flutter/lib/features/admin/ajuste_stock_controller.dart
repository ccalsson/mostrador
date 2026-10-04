import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/alertas_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/productos_service.dart';

/// Modo elegido en la UI. `restar` envía un ajuste negativo; `merma` envía
/// cantidad positiva con tipo `merma` y el backend la descuenta en absoluto.
enum AjusteModo { sumar, restar, merma }

enum AjusteFase { inactiva, enviando, error }

class AjusteEstado {
  const AjusteEstado({
    this.fase = AjusteFase.inactiva,
    this.errorMensaje,
  });

  final AjusteFase fase;
  final String? errorMensaje;

  bool get enviando => fase == AjusteFase.enviando;
}

/// Ajuste/merma de stock desde el tablero admin. La cantidad de la UI es
/// siempre positiva: el signo lo decide el modo, no el operador. Al éxito
/// invalida catálogo y alertas (el ajuste puede cruzar el stock mínimo).
class AjusteStockController extends Notifier<AjusteEstado> {
  @override
  AjusteEstado build() => const AjusteEstado();

  /// Llamar al abrir el diálogo para limpiar un error de una apertura previa.
  void reiniciar() => state = const AjusteEstado();

  Future<bool> ajustar({
    required String productoId,
    required AjusteModo modo,
    required double cantidad,
    required String motivo,
  }) async {
    if (state.enviando || cantidad <= 0) return false;
    state = const AjusteEstado(fase: AjusteFase.enviando);
    try {
      await ref.read(productosAdminServiceProvider).ajustarStock(
            productoId: productoId,
            cantidad: switch (modo) {
              AjusteModo.sumar => cantidad,
              AjusteModo.restar => -cantidad,
              AjusteModo.merma => cantidad,
            },
            tipo: modo == AjusteModo.merma ? 'merma' : 'ajuste',
            motivo: motivo,
          );
      if (!ref.mounted) return false;
      ref.invalidate(catalogoProvider);
      ref.invalidate(alertasProvider);
      state = const AjusteEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = AjusteEstado(fase: AjusteFase.error, errorMensaje: error.message);
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const AjusteEstado(
        fase: AjusteFase.error,
        errorMensaje: 'No se pudo registrar el ajuste.',
      );
      return false;
    }
  }
}

final ajusteStockProvider =
    NotifierProvider<AjusteStockController, AjusteEstado>(
  AjusteStockController.new,
);
