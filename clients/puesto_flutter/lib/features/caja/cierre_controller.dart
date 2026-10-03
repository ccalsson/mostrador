import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/caja.dart';
import '../../services/caja_service.dart';

enum CierreFase { inactiva, enviando, error, exito }

class CierreEstado {
  const CierreEstado({
    this.fase = CierreFase.inactiva,
    this.errorMensaje,
    this.resultado,
    this.contado,
  });

  final CierreFase fase;
  final String? errorMensaje;
  final CierreCajaResultado? resultado;

  /// Total contado enviado al backend; sólo para mostrarlo junto al
  /// resultado (no se deriva ningún cálculo de él).
  final double? contado;

  bool get enviando => fase == CierreFase.enviando;
  bool get exito => fase == CierreFase.exito;
}

/// Cierre del turno de caja (`POST /api/v1/caja/cerrar`).
///
/// Sin lógica financiera local: el backend recalcula `esperado`, guarda el
/// arqueo, alerta si hay diferencia y abre un turno nuevo. El guard de
/// enviando/exito evita cierres concurrentes; al éxito se refresca el estado
/// para que la vista muestre el turno nuevo.
class CierreController extends Notifier<CierreEstado> {
  CierreController(this.cajaId);

  final String cajaId;

  @override
  CierreEstado build() => const CierreEstado();

  Future<void> cerrar({required double real, String? notas}) async {
    if (state.enviando || state.exito) return;
    state = const CierreEstado(fase: CierreFase.enviando);
    try {
      final resultado = await ref.read(cajaServiceProvider).cerrarCaja(
            id: cajaId,
            real: real,
            notas: notas,
          );
      if (!ref.mounted) return;
      // El backend ya abrió el turno nuevo: releer para mostrarlo.
      ref.invalidate(cajaEstadoProvider);
      state = CierreEstado(
        fase: CierreFase.exito,
        resultado: resultado,
        contado: real,
      );
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = CierreEstado(fase: CierreFase.error, errorMensaje: error.message);
    } catch (_) {
      if (!ref.mounted) return;
      state = const CierreEstado(
        fase: CierreFase.error,
        errorMensaje: 'No se pudo cerrar la caja.',
      );
    }
  }
}

final cierreControllerProvider =
    NotifierProvider.family<CierreController, CierreEstado, String>(
  CierreController.new,
);
