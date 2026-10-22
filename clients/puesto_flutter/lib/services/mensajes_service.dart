import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/mensajes.dart';

/// Servicio de mensajería pedido↔cliente para el staff del negocio.
class MensajesService {
  MensajesService(this._client);

  final ApiClient _client;

  /// `GET /api/v1/mensajes/conversaciones`: últimas 40 conversaciones.
  Future<List<ConversacionResumen>> listarConversaciones() async {
    final data =
        await _client.get('/api/v1/mensajes/conversaciones') as Map<String, dynamic>;
    final raw = data['data'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ConversacionResumen.fromJson)
        .toList();
  }

  /// `GET /api/v1/pedidos/:id/mensajes`: hilo del pedido (marca como leídos).
  Future<MensajesPagina> mensajesDelPedido(String pedidoId) async {
    final data =
        await _client.get('/api/v1/pedidos/$pedidoId/mensajes') as Map<String, dynamic>;
    return MensajesPagina.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// `POST /api/v1/pedidos/:id/mensajes`: enviar respuesta como negocio.
  Future<void> enviar(String pedidoId, String cuerpo) async {
    await _client
        .post('/api/v1/pedidos/$pedidoId/mensajes', body: {'cuerpo': cuerpo});
  }
}

final mensajesServiceProvider =
    Provider<MensajesService>((ref) => MensajesService(ref.watch(apiClientProvider)));

final conversacionesProvider = FutureProvider<List<ConversacionResumen>>(
  (ref) => ref.watch(mensajesServiceProvider).listarConversaciones(),
);

/// Hilo de mensajes de un pedido concreto.
final mensajesDePedidoProvider =
    FutureProvider.family<MensajesPagina, String>(
  (ref, pedidoId) => ref.watch(mensajesServiceProvider).mensajesDelPedido(pedidoId),
);
