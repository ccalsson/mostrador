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
    this.publicadoOnline,
    this.stockInicial,
    this.costo,
  });

  final String? id;
  final String nombre;
  final String unidad;
  final String unidadLabel;
  final double precio;
  final double stockMinimo;
  final List<String> alias;
  final bool activo;
  final bool? publicadoOnline;

  /// Sólo se envía en alta; el backend lo ignora al editar.
  final double? stockInicial;
  
  /// Costo del producto para cálculo de margen (opcional).
  final double? costo;

  Map<String, dynamic> toJson() => {
    if (id != null) 'id': id,
    'nombre': nombre,
    'unidad': unidad,
    'unidadLabel': unidadLabel,
    'precio': precio,
    'stockMinimo': stockMinimo,
    'alias': alias,
    'activo': activo,
    if (publicadoOnline != null) 'publicadoOnline': publicadoOnline,
    if (id == null && stockInicial != null) 'stockInicial': stockInicial,
    if (costo != null) 'costo': costo,
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
    final data = await _client.post(
      '/api/v1/productos',
      body: input.toJson(),
    ) as Map<String, dynamic>;
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
    await _client.post(
      '/api/v1/stock/ajuste',
      body: {
        'productoId': productoId,
        'cantidad': cantidad,
        'tipo': tipo,
        'motivo': motivo,
      },
    );
  }
  
  /// `POST /api/v1/productos/:id/foto` — sube foto del producto (multipart).
  /// Devuelve la URL pública de la foto.
  Future<String> subirFoto({
    required String productoId,
    required List<int> bytes,
    required String nombreArchivo,
    required String mimeType,
  }) async {
    final data = await _client.postMultipart(
      '/api/v1/productos/$productoId/foto',
      fieldName: 'foto',
      fileName: nombreArchivo,
      mimeType: mimeType,
      bytes: bytes,
    ) as Map<String, dynamic>;
    return (data['data'] as Map<String, dynamic>)['foto_url'] as String;
  }
  
  /// `DELETE /api/v1/productos/:id/foto` — borra la foto del producto.
  Future<void> borrarFoto(String productoId) async {
    await _client.delete('/api/v1/productos/$productoId/foto');
  }
}

final productosAdminServiceProvider = Provider<ProductosAdminService>(
  (ref) => ProductosAdminService(ref.watch(apiClientProvider)),
);
