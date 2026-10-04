import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/usuarios_service.dart';

enum UsuarioFormFase { inactiva, enviando, error }

class UsuarioFormEstado {
  const UsuarioFormEstado({
    this.fase = UsuarioFormFase.inactiva,
    this.errorMensaje,
  });

  final UsuarioFormFase fase;
  final String? errorMensaje;

  bool get enviando => fase == UsuarioFormFase.enviando;
}

/// Alta de usuario desde el tablero admin. Invalida la lista de usuarios al
/// éxito. El diálogo se cierra cuando [crear] devuelve `true`.
class UsuarioFormController extends Notifier<UsuarioFormEstado> {
  @override
  UsuarioFormEstado build() => const UsuarioFormEstado();

  void reiniciar() => state = const UsuarioFormEstado();

  Future<bool> crear(UsuarioInput input) async {
    if (state.enviando) return false;
    state = const UsuarioFormEstado(fase: UsuarioFormFase.enviando);
    try {
      await ref.read(usuariosServiceProvider).crear(input);
      if (!ref.mounted) return false;
      ref.invalidate(usuariosProvider);
      state = const UsuarioFormEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = UsuarioFormEstado(
        fase: UsuarioFormFase.error,
        errorMensaje: error.message,
      );
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const UsuarioFormEstado(
        fase: UsuarioFormFase.error,
        errorMensaje: 'No se pudo crear el usuario.',
      );
      return false;
    }
  }
}

final usuarioFormProvider =
    NotifierProvider<UsuarioFormController, UsuarioFormEstado>(
  UsuarioFormController.new,
);
