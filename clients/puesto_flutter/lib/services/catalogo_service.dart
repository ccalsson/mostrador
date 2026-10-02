import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/producto.dart';

/// Lectura del catálogo (`GET /api/v1/catalogo`, con ETag).
class CatalogoService {
  CatalogoService(this._client);

  final ApiClient _client;

  Future<Catalogo> listar() async {
    final data = await _client.get('/api/v1/catalogo') as Map<String, dynamic>;
    final productos = (data['data'] as List)
        .map((json) => Producto.fromJson(json as Map<String, dynamic>))
        .toList();
    return Catalogo(productos: productos, version: data['version'] as String?);
  }
}

final catalogoServiceProvider =
    Provider<CatalogoService>((ref) => CatalogoService(ref.watch(apiClientProvider)));

final catalogoProvider = FutureProvider<Catalogo>(
  (ref) => ref.watch(catalogoServiceProvider).listar(),
);
