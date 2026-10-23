import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/creativo.dart';

/// Servicio de creativos. Consume los endpoints `/api/v1/creativos` del
/// backend para listar estado, generar piezas con IA, enviar y borrar.
class CreativosService {
  CreativosService(this._client);

  final ApiClient _client;

  /// `GET /api/v1/creativos` — saldo, paquetes, piezas habilitadas y pedidos.
  Future<EstadoCreativos> listar() async {
    final data =
        await _client.get('/api/v1/creativos') as Map<String, dynamic>;
    final estado = data['data'] as Map<String, dynamic>? ?? data;
    return EstadoCreativos.fromJson(estado);
  }

  /// `POST /api/v1/creativos` — genera una pieza con IA. Descuenta créditos.
  Future<ResultadoGeneracion> generar({
    required TipoCreativo tipo,
    required String brief,
    String? fotoUrl,
  }) async {
    final body = <String, dynamic>{
      'formato': tipo.name,
      'brief': brief,
      if (fotoUrl != null && fotoUrl.isNotEmpty) 'fotoUrl': fotoUrl,
    };
    final data = await _client.post(
      '/api/v1/creativos',
      body: body,
    ) as Map<String, dynamic>;
    final resultado = data['data'] as Map<String, dynamic>? ?? data;
    return ResultadoGeneracion.fromJson(resultado);
  }

  /// `POST /api/v1/creativos/{id}/enviar` — marca el pedido como enviado.
  Future<void> enviar(String id) async {
    await _client.post('/api/v1/creativos/$id/enviar');
  }

  /// `DELETE /api/v1/creativos/{id}` — borra el pedido. Gasta crédito de IA.
  Future<void> borrar(String id) async {
    await _client.delete('/api/v1/creativos/$id');
  }
}

final creativosServiceProvider = Provider<CreativosService>(
  (ref) => CreativosService(ref.watch(apiClientProvider)),
);

/// Provider que lista el estado completo de creativos (saldo + pedidos).
final creativosEstadoProvider = FutureProvider<EstadoCreativos>(
  (ref) => ref.watch(creativosServiceProvider).listar(),
);
