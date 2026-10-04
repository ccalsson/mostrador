import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../services/clientes_service.dart';

enum ClienteFormFase { inactiva, enviando, error }

class ClienteFormEstado {
  const ClienteFormEstado({
    this.fase = ClienteFormFase.inactiva,
    this.errorMensaje,
  });

  final ClienteFormFase fase;
  final String? errorMensaje;

  bool get enviando => fase == ClienteFormFase.enviando;
}

class ClienteFormController extends Notifier<ClienteFormEstado> {
  @override
  ClienteFormEstado build() => const ClienteFormEstado();

  void reiniciar() => state = const ClienteFormEstado();

  Future<bool> crear(ClienteInput input) async {
    if (state.enviando) return false;
    state = const ClienteFormEstado(fase: ClienteFormFase.enviando);
    try {
      await ref.read(clientesServiceProvider).crear(input);
      if (!ref.mounted) return false;
      ref.invalidate(clientesProvider);
      state = const ClienteFormEstado();
      return true;
    } on ApiException catch (error) {
      if (!ref.mounted) return false;
      state = ClienteFormEstado(
        fase: ClienteFormFase.error,
        errorMensaje: error.message,
      );
      return false;
    } catch (_) {
      if (!ref.mounted) return false;
      state = const ClienteFormEstado(
        fase: ClienteFormFase.error,
        errorMensaje: 'No se pudo crear el cliente.',
      );
      return false;
    }
  }
}

final clienteFormProvider =
    NotifierProvider<ClienteFormController, ClienteFormEstado>(
  ClienteFormController.new,
);
