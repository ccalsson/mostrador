import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/checklist.dart';

/// Checklist de entrega contra la API v1.
///
/// Endpoints:
/// - `GET    /api/v1/pedidos/:id/checklist`       → listar items
/// - `POST   /api/v1/pedidos/:id/checklist`       → crear item
/// - `PATCH  /api/v1/pedidos/:id/checklist/:item` → toggle completado
/// - `DELETE /api/v1/pedidos/:id/checklist/:item` → borrar item
/// - `GET    /api/v1/checklist/templates`          → listar plantillas
/// - `POST   /api/v1/checklist/templates`          → crear plantilla
class ChecklistService {
  ChecklistService(this._client);

  final ApiClient _client;

  // ── Items ──────────────────────────────────────────────────────────

  /// `GET /api/v1/pedidos/:id/checklist`
  Future<List<ChecklistItem>> listarItems(String pedidoId) async {
    final data = await _client.get(
      '/api/v1/pedidos/$pedidoId/checklist',
    ) as Map<String, dynamic>;
    return [
      for (final item in (data['data'] as List? ?? const []))
        ChecklistItem.fromJson(item as Map<String, dynamic>),
    ];
  }

  /// `POST /api/v1/pedidos/:id/checklist`
  Future<ChecklistItem> crearItem(String pedidoId, String descripcion) async {
    final data = await _client.post(
      '/api/v1/pedidos/$pedidoId/checklist',
      body: {'descripcion': descripcion},
    ) as Map<String, dynamic>;
    return ChecklistItem.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// `PATCH /api/v1/pedidos/:id/checklist/:itemId`
  Future<ChecklistItem> toggleItem(
    String pedidoId,
    String itemId,
    bool completado,
  ) async {
    final data = await _client.patch(
      '/api/v1/pedidos/$pedidoId/checklist/$itemId',
      body: {'completado': completado},
    ) as Map<String, dynamic>;
    return ChecklistItem.fromJson(data['data'] as Map<String, dynamic>);
  }

  /// `DELETE /api/v1/pedidos/:id/checklist/:itemId`
  Future<void> borrarItem(String pedidoId, String itemId) async {
    await _client.delete(
      '/api/v1/pedidos/$pedidoId/checklist/$itemId',
    );
  }

  // ── Templates ──────────────────────────────────────────────────────

  /// `GET /api/v1/checklist/templates`
  Future<List<ChecklistTemplate>> listarTemplates() async {
    final data = await _client.get(
      '/api/v1/checklist/templates',
    ) as Map<String, dynamic>;
    return [
      for (final t in (data['data'] as List? ?? const []))
        ChecklistTemplate.fromJson(t as Map<String, dynamic>),
    ];
  }

  /// `POST /api/v1/checklist/templates`
  Future<ChecklistTemplate> crearTemplate(
    String nombre,
    List<String> items,
  ) async {
    final data = await _client.post(
      '/api/v1/checklist/templates',
      body: {'nombre': nombre, 'items': items},
    ) as Map<String, dynamic>;
    return ChecklistTemplate.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final checklistServiceProvider = Provider<ChecklistService>(
  (ref) => ChecklistService(ref.watch(apiClientProvider)),
);

/// Sin reintentos automaticos: el error debe verse al instante.
Duration? _sinReintentos(int retryCount, Object error) => null;

/// Items de checklist de un pedido (`GET /api/v1/pedidos/:id/checklist`).
final checklistItemsProvider =
    FutureProvider.family<List<ChecklistItem>, String>(
  (ref, pedidoId) =>
      ref.watch(checklistServiceProvider).listarItems(pedidoId),
  retry: _sinReintentos,
);

/// Plantillas de checklist activas (`GET /api/v1/checklist/templates`).
final checklistTemplatesProvider = FutureProvider<List<ChecklistTemplate>>(
  (ref) => ref.watch(checklistServiceProvider).listarTemplates(),
  retry: _sinReintentos,
);
