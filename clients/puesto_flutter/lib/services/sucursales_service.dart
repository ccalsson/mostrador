import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/sucursal.dart';

class SucursalesService {
  SucursalesService(this._client);

  final ApiClient _client;

  Future<PanelSucursales> listar() async {
    final response =
        await _client.get('/api/v1/sucursales') as Map<String, dynamic>;
    return PanelSucursales.fromJson(response['data'] as Map<String, dynamic>);
  }

  Future<({String id, int productos})> crear({
    required String nombre,
    required String referencia,
  }) async {
    final response = await _client.post(
      '/api/v1/sucursales',
      body: {'nombre': nombre, 'referencia': referencia},
    ) as Map<String, dynamic>;
    final data = response['data'] as Map<String, dynamic>;
    return (
      id: data['id'] as String,
      productos: (data['productos'] as num).toInt(),
    );
  }

  Future<void> usar(String id) async {
    await _client.postExclusive(
      '/api/v1/sucursales/${Uri.encodeComponent(id)}/usar',
    );
  }

  Future<void> transferir({
    required String destinoId,
    required String productoId,
    required double cantidad,
  }) async {
    await _client.post(
      '/api/v1/sucursales/${Uri.encodeComponent(destinoId)}/transferir',
      body: {'productoId': productoId, 'cantidad': cantidad},
    );
  }

  Future<int> importarClientes(String idSucursalOrigen) async {
    final response = await _client.post(
      '/api/v1/sucursales/${Uri.encodeComponent(idSucursalOrigen)}/importar-clientes',
    ) as Map<String, dynamic>;
    final data = response['data'] as Map<String, dynamic>;
    return (data['importados'] as num).toInt();
  }
}

final sucursalesServiceProvider = Provider<SucursalesService>(
  (ref) => SucursalesService(ref.watch(apiClientProvider)),
);

final sucursalesProvider = FutureProvider<PanelSucursales>(
  (ref) => ref.watch(sucursalesServiceProvider).listar(),
);
