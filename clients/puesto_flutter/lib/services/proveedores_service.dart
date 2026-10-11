import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/proveedor.dart';

class ProveedorInput {
  const ProveedorInput({
    required this.nombre,
    this.cuit,
    this.telefono,
    this.email,
    this.direccion,
    this.observaciones,
    this.activo = true,
  });

  final String nombre;
  final String? cuit;
  final String? telefono;
  final String? email;
  final String? direccion;
  final String? observaciones;
  final bool activo;

  Map<String, dynamic> toJson({bool incluirActivo = false}) => {
    'nombre': nombre,
    'cuit': cuit,
    'telefono': telefono,
    'email': email,
    'direccion': direccion,
    'observaciones': observaciones,
    if (incluirActivo) 'activo': activo,
  };
}

class ProveedoresService {
  ProveedoresService(this._client);

  final ApiClient _client;

  Future<List<Proveedor>> listar() async {
    final data =
        await _client.get('/api/v1/proveedores') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Proveedor.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<void> crear(ProveedorInput input) async {
    await _client.post('/api/v1/proveedores', body: input.toJson());
  }

  Future<void> actualizar(String id, ProveedorInput input) async {
    await _client.post(
      '/api/v1/proveedores/$id',
      body: input.toJson(incluirActivo: true),
    );
  }

  Future<List<String>> productos(String proveedorId) async {
    final data = await _client.get(
      '/api/v1/proveedores/$proveedorId/productos',
    ) as Map<String, dynamic>;
    final respuesta = data['data'] as Map<String, dynamic>;
    return (respuesta['productos'] as List).cast<String>();
  }
}

final proveedoresServiceProvider = Provider<ProveedoresService>(
  (ref) => ProveedoresService(ref.watch(apiClientProvider)),
);

final proveedoresProvider = FutureProvider<List<Proveedor>>(
  (ref) => ref.watch(proveedoresServiceProvider).listar(),
);

final productosProveedorProvider = FutureProvider.family<List<String>, String>(
  (ref, proveedorId) =>
      ref.watch(proveedoresServiceProvider).productos(proveedorId),
);
