import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/marca.dart';

/// Servicio de identidad del puesto. Consume `GET /api/v1/marca` para leer
/// los cinco campos editables y `POST /api/v1/marca` para persistir cambios.
/// Sólo el rol dueño (admin) tiene acceso; el backend rechaza al resto con
/// 403 `rol_no_permitido`.
class MarcaService {
  MarcaService(this._client);

  final ApiClient _client;

  /// Lee la marca actual del puesto.
  Future<Marca> obtener() async {
    final data =
        await _client.get('/api/v1/marca') as Map<String, dynamic>;
    return Marca.fromJson(data);
  }

  /// Persiste los cinco campos de la marca. El backend espera un JSON plano
  /// con las claves exactas del modelo.
  Future<void> guardar(Marca marca) async {
    await _client.post('/api/v1/marca', body: marca.toJson());
  }
}

final marcaServiceProvider = Provider<MarcaService>(
  (ref) => MarcaService(ref.watch(apiClientProvider)),
);

final marcaProvider = FutureProvider<Marca>(
  (ref) => ref.watch(marcaServiceProvider).obtener(),
);
