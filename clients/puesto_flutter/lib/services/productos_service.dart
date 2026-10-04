import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';

/// Entrada de alta/edición de producto (`POST /api/v1/productos`).
class ProductoInput {
  const ProductoInput({
    this.id,
    required this.nombre,
    required this.unidad,
    required this.unidadLabel,
    required this.precio,
    required this.stockMinimo,
    required this.alias,
    required this.activo,
    this.stockInicial,
  });

  final String? id;
  final String nombre;
  final String unidad;
  final String unidadLabel;
  final double precio;
  final double stockMinimo;
  final List<String> alias;
  final bool activo;

  /// Sólo se envía en alta; el backend lo ignora al editar.
  final double? stockInicial;

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        'nombre': nombre,
        'unidad': unidad,
        'unidadLabel': unidadLabel,
        'precio': precio,
        'stockMinimo': stockMinimo,
        'alias': alias,
        'activo': activo,
        if (id == null && stockInicial != null) 'stockInicial': stockInicial,
      };
}

/// Mutaciones de catálogo e inventario: alta/edición/baja (admin) y
/// ajuste/merma de stock (admin o cajero, según el contrato v1).
class ProductosAdminService {
  ProductosAdminService(this._client);

  final ApiClient _client;

  /// `POST /api/v1/productos` — alta sin `id`, edición con `id`.
  /// Devuelve el id creado o editado.
  Future<String> guardar(ProductoInput input) async {
    final data =
        await _client.post('/api/v1/productos', body: input.toJson())
            as Map<String, dynamic>;
    return (data['data'] as Map<String, dynamic>)['id'] as String;
  }

  /// `POST /api/v1/productos/{id}/baja` — baja lógica, idempotente.
  Future<void> bajar(String id) async {
    await _client.post('/api/v1/productos/$id/baja');
  }

  /// `POST /api/v1/stock/ajuste` — `tipo` es `ajuste` (con signo) o `merma`
  /// (el backend la descuenta siempre en absoluto).
  Future<void> ajustarStock({
    required String productoId,
    required double cantidad,
    required String tipo,
    required String motivo,
  }) async {
    await _client.post('/api/v1/stock/ajuste', body: {
      'productoId': productoId,
      'cantidad': cantidad,
      'tipo': tipo,
      'motivo': motivo,
    });
  }
}

final productosAdminServiceProvider = Provider<ProductosAdminService>(
  (ref) => ProductosAdminService(ref.watch(apiClientProvider)),
);
