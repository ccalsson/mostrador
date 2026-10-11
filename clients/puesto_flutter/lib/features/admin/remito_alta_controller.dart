import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/proveedor.dart';
import '../../models/remito_ocr.dart';
import '../../services/remitos_service.dart';

enum RemitoAltaFase { inactiva, leyendo, enviando, error }

class RemitoAltaEstado {
  const RemitoAltaEstado({
    this.fase = RemitoAltaFase.inactiva,
    this.errorMensaje,
    this.aviso,
    this.lectura,
  });

  final RemitoAltaFase fase;
  final String? errorMensaje;
  final String? aviso;
  final RemitoOcrLectura? lectura;

  bool get ocupado =>
      fase == RemitoAltaFase.leyendo || fase == RemitoAltaFase.enviando;
}

class RemitoAltaController extends Notifier<RemitoAltaEstado> {
  @override
  RemitoAltaEstado build() => const RemitoAltaEstado();

  void reiniciar() => state = const RemitoAltaEstado();

  /// Empareja el nombre leído con el directorio. Si no hay match, el usuario elige.
  String? proveedorDeLectura(
    RemitoOcrLectura lectura,
    List<Proveedor> activos,
  ) {
    final nombre = lectura.proveedor?.trim().toLowerCase();
    if (nombre == null || nombre.isEmpty) return null;
    for (final proveedor in activos) {
      if (proveedor.nombre.trim().toLowerCase() == nombre) return proveedor.id;
    }
    return null;
  }

  Future<RemitoOcrLectura?> leerFoto(RemitoImagen imagen) async {
    if (state.ocupado) return null;
    state = const RemitoAltaEstado(fase: RemitoAltaFase.leyendo);
    try {
      final lectura = await ref.read(remitosServiceProvider).ocr(imagen);
      if (!ref.mounted) return null;
      state = RemitoAltaEstado(
        lectura: lectura,
        aviso: lectura.lineas.isEmpty
            ? 'La foto está. No distinguí líneas: completalas a mano.'
            : 'Leí ${lectura.lineas.length} líneas. Revisalas antes de cargar.',
      );
      return lectura;
    } on ApiException catch (error) {
      if (!ref.mounted) return null;
      state = RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: error.message,
      );
      return null;
    } catch (_) {
      if (!ref.mounted) return null;
      state = const RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: 'No pude leer la foto. Cargá las líneas a mano.',
      );
      return null;
    }
  }

  Future<String?> cargar({
    required String proveedorId,
    required String fuente,
    String? archivoNombre,
    required List<RemitoLineaAlta> lineas,
  }) async {
    if (state.ocupado) return null;
    if (proveedorId.isEmpty) {
      state = const RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: 'Elegí un proveedor.',
      );
      return null;
    }
    if (lineas.isEmpty) {
      state = const RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: 'El remito debe incluir al menos una línea.',
      );
      return null;
    }
    state = const RemitoAltaEstado(fase: RemitoAltaFase.enviando);
    try {
      final id = await ref.read(remitosServiceProvider).crear(
            proveedorId: proveedorId,
            fuente: fuente,
            archivoNombre: archivoNombre,
            lineas: lineas,
          );
      if (!ref.mounted) return null;
      ref.invalidate(remitosProvider);
      state = const RemitoAltaEstado();
      return id;
    } on ApiException catch (error) {
      if (!ref.mounted) return null;
      state = RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: error.message,
      );
      return null;
    } catch (_) {
      if (!ref.mounted) return null;
      state = const RemitoAltaEstado(
        fase: RemitoAltaFase.error,
        errorMensaje: 'No se pudo cargar el remito.',
      );
      return null;
    }
  }
}

final remitoAltaProvider =
    NotifierProvider.autoDispose<RemitoAltaController, RemitoAltaEstado>(
  RemitoAltaController.new,
);
