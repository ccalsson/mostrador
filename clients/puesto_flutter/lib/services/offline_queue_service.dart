import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/pedido_pendiente.dart';

/// Persistencia local de pedidos pendientes usando SharedPreferences.
///
/// La cola se guarda como JSON bajo la clave [keyCola]. Permite agregar,
/// eliminar y listar pedidos pendientes para replay cuando se recupera
/// la conectividad.
class OfflineQueueService {
  OfflineQueueService(this._prefs);

  static const String keyCola = 'mostrador.outbox';

  final SharedPreferences _prefs;

  /// Devuelve la cola actual de pedidos pendientes.
  List<PedidoPendiente> leer() {
    final raw = _prefs.getString(keyCola);
    if (raw == null || raw.isEmpty) return [];
    try {
      return decodificarCola(raw);
    } catch (_) {
      return [];
    }
  }

  /// Agrega un pedido pendiente a la cola.
  Future<void> agregar(PedidoPendiente pedido) async {
    final cola = leer();
    cola.add(pedido);
    await _guardar(cola);
  }

  /// Elimina un pedido de la cola por su clientUuid (éxito o descarte).
  Future<void> eliminar(String clientUuid) async {
    final cola = leer().where((p) => p.clientUuid != clientUuid).toList();
    await _guardar(cola);
  }

  /// Reemplaza un pedido existente (para incrementar reintentos).
  Future<void> actualizar(PedidoPendiente pedido) async {
    final cola = leer();
    final indice = cola.indexWhere((p) => p.clientUuid == pedido.clientUuid);
    if (indice >= 0) {
      cola[indice] = pedido;
    } else {
      cola.add(pedido);
    }
    await _guardar(cola);
  }

  /// Limpia toda la cola.
  Future<void> limpiar() async {
    await _prefs.remove(keyCola);
  }

  Future<void> _guardar(List<PedidoPendiente> cola) async {
    if (cola.isEmpty) {
      await _prefs.remove(keyCola);
    } else {
      await _prefs.setString(keyCola, codificarCola(cola));
    }
  }
}

/// Proveedor de SharedPreferences (singleton).
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError(
    'sharedPreferencesProvider debe ser sobreescrito en main() con '
    'SharedPreferences.getInstance().',
  );
});

/// Proveedor del servicio de cola offline.
final offlineQueueServiceProvider = Provider<OfflineQueueService>((ref) {
  return OfflineQueueService(ref.watch(sharedPreferencesProvider));
});
