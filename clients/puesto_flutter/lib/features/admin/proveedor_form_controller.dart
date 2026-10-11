import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/proveedores_service.dart';

enum ProveedorFormFase { inactiva, enviando, error }

class ProveedorFormEstado {
  const ProveedorFormEstado({
    this.fase = ProveedorFormFase.inactiva,
    this.errorMensaje,
  });

  final ProveedorFormFase fase;
  final String? errorMensaje;

  bool get enviando => fase == ProveedorFormFase.enviando;
}

class ProveedorFormController extends Notifier<ProveedorFormEstado> {
  @override
  ProveedorFormEstado build() => const ProveedorFormEstado();

  void reiniciar() => state = const ProveedorFormEstado();

  Future<bool> guardar({required ProveedorInput input, String? id}) async {
    if (state.enviando) return false;
    state = const ProveedorFormEstado(fase: ProveedorFormFase.enviando);
    try {
      final service = ref.read(proveedoresServiceProvider);
      if (id == null) {
        await service.crear(input);
      } else {
        await service.actualizar(id, input);
      }
      if (!ref.mounted) return false;
      ref.invalidate(proveedoresProvider);
      state = const ProveedorFormEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = ProveedorFormEstado(
        fase: ProveedorFormFase.error,
        errorMensaje: error.message,
      );
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const ProveedorFormEstado(
        fase: ProveedorFormFase.error,
        errorMensaje: 'No se pudo guardar el proveedor.',
      );
      return false;
    }
  }
}

final proveedorFormProvider =
    NotifierProvider<ProveedorFormController, ProveedorFormEstado>(
      ProveedorFormController.new,
    );
