import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/alertas_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/productos_service.dart';

enum ProductoFormFase { inactiva, enviando, error }

class ProductoFormEstado {
  const ProductoFormEstado({
    this.fase = ProductoFormFase.inactiva,
    this.errorMensaje,
  });

  final ProductoFormFase fase;
  final String? errorMensaje;

  bool get enviando => fase == ProductoFormFase.enviando;
}

/// Alta/edición/baja de producto desde el tablero admin. Devuelve `true` al
/// éxito para que el diálogo se cierre; el estado no retiene una fase de
/// éxito porque el diálogo desaparece. Invalida catálogo (el ETag cambia con
/// cualquier write) y alertas (un alta con stock inicial bajo genera una).
class ProductoFormController extends Notifier<ProductoFormEstado> {
  @override
  ProductoFormEstado build() => const ProductoFormEstado();

  /// Llamar al abrir el diálogo para limpiar un error de una apertura previa.
  void reiniciar() => state = const ProductoFormEstado();

  Future<bool> guardar(ProductoInput input) async {
    if (state.enviando) return false;
    state = const ProductoFormEstado(fase: ProductoFormFase.enviando);
    try {
      await ref.read(productosAdminServiceProvider).guardar(input);
      if (!ref.mounted) return false;
      ref.invalidate(catalogoProvider);
      ref.invalidate(alertasProvider);
      state = const ProductoFormEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = ProductoFormEstado(
        fase: ProductoFormFase.error,
        errorMensaje: error.message,
      );
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const ProductoFormEstado(
        fase: ProductoFormFase.error,
        errorMensaje: 'No se pudo guardar el producto.',
      );
      return false;
    }
  }

  Future<bool> bajar(String id) async {
    if (state.enviando) return false;
    state = const ProductoFormEstado(fase: ProductoFormFase.enviando);
    try {
      await ref.read(productosAdminServiceProvider).bajar(id);
      if (!ref.mounted) return false;
      ref.invalidate(catalogoProvider);
      state = const ProductoFormEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = ProductoFormEstado(
        fase: ProductoFormFase.error,
        errorMensaje: error.message,
      );
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const ProductoFormEstado(
        fase: ProductoFormFase.error,
        errorMensaje: 'No se pudo dar de baja el producto.',
      );
      return false;
    }
  }
}

final productoFormProvider =
    NotifierProvider<ProductoFormController, ProductoFormEstado>(
  ProductoFormController.new,
);
