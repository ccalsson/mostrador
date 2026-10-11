import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/remito.dart';
import '../models/remito_ocr.dart';

class RemitosService {
  RemitosService(this._client);

  final ApiClient _client;

  Future<String> crear({
    required String proveedorId,
    required String fuente,
    String? archivoNombre,
    required List<RemitoLineaAlta> lineas,
  }) async {
    final data = await _client.post(
      '/api/v1/remitos',
      body: {
        'proveedorId': proveedorId,
        'fuente': fuente,
        'archivoNombre': ?archivoNombre,
        'lineas': [for (final linea in lineas) linea.toJson()],
      },
    ) as Map<String, dynamic>;
    final cuerpo = data['data'] as Map<String, dynamic>;
    return cuerpo['id'] as String;
  }

  Future<RemitoOcrLectura> ocr(RemitoImagen imagen) async {
    final data = await _client.post(
      '/api/v1/remitos/ocr',
      body: {
        'imageBase64': base64Encode(imagen.bytes),
        'mimeType': imagen.mimeType,
      },
    ) as Map<String, dynamic>;
    return RemitoOcrLectura.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<void> asignarProveedor({
    required String remitoId,
    required String proveedorId,
  }) async {
    await _client.post(
      '/api/v1/remitos/$remitoId/proveedor',
      body: {'proveedorId': proveedorId},
    );
  }

  Future<List<Remito>> listar() async {
    final data = await _client.get('/api/v1/remitos') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Remito.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<Remito> obtener(String id) async {
    final data = await _client.get('/api/v1/remitos/$id') as Map<String, dynamic>;
    return Remito.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<void> actualizarItem({
    required String id,
    required String? productoId,
    required double cantidad,
    required bool confirmado,
  }) async {
    await _client.post(
      '/api/v1/remitos/items',
      body: {
        'id': id,
        'productoId': productoId,
        'cantidad': cantidad,
        'confirmado': confirmado,
      },
    );
  }

  Future<void> confirmar(String remitoId) async {
    await _client.post('/api/v1/remitos/$remitoId/confirmar');
  }
}

final remitosServiceProvider = Provider<RemitosService>(
  (ref) => RemitosService(ref.watch(apiClientProvider)),
);

final remitosProvider = FutureProvider<List<Remito>>(
  (ref) => ref.watch(remitosServiceProvider).listar(),
);

final remitoProvider = FutureProvider.family<Remito, String>(
  (ref, id) => ref.watch(remitosServiceProvider).obtener(id),
);
