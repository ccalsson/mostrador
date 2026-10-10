import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/cliente.dart';
import '../models/cuenta_corriente.dart';

class ClienteInput {
  const ClienteInput({
    required this.nombre,
    this.telefono,
    required this.cuentaCorriente,
  });

  final String nombre;
  final String? telefono;
  final bool cuentaCorriente;

  Map<String, dynamic> toJson() => {
    'nombre': nombre,
    if (telefono != null) 'telefono': telefono,
    'cuentaCorriente': cuentaCorriente,
  };
}

class ClienteActualizacionInput {
  const ClienteActualizacionInput({
    required this.nombre,
    this.telefono,
    this.cuit,
    this.direccion,
    required this.cuentaCorriente,
    required this.condicionIva,
    required this.activo,
  });

  final String nombre;
  final String? telefono;
  final String? cuit;
  final String? direccion;
  final bool cuentaCorriente;
  final String condicionIva;
  final bool activo;

  Map<String, dynamic> toJson() => {
    'nombre': nombre,
    'telefono': telefono,
    'cuit': cuit,
    'direccion': direccion,
    'cuentaCorriente': cuentaCorriente,
    'condicionIva': condicionIva,
    'activo': activo,
  };
}

class ClientesService {
  ClientesService(this._client);

  final ApiClient _client;

  Future<List<Cliente>> listar() async {
    final data = await _client.get('/api/v1/clientes') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Cliente.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<Cliente> crear(ClienteInput input) async {
    final data = await _client.post(
      '/api/v1/clientes',
      body: input.toJson(),
    ) as Map<String, dynamic>;
    // El backend solo devuelve {id, nombre}, por lo que mergeamos el input
    // para tener el objeto completo en la UI si es necesario temporalmente
    final responseData = data['data'] as Map<String, dynamic>;
    return Cliente(
      id: responseData['id'] as String,
      nombre: responseData['nombre'] as String,
      telefono: input.telefono,
      cuentaCorriente: input.cuentaCorriente,
    );
  }

  Future<void> actualizar(String id, ClienteActualizacionInput input) async {
    await _client.post('/api/v1/clientes/$id', body: input.toJson());
  }

  Future<void> registrarPago(
    String id, {
    required double monto,
    String? nota,
  }) async {
    await _client.post(
      '/api/v1/clientes/$id/pagos',
      body: {'monto': monto, 'nota': nota},
    );
  }

  Future<CuentaCorriente> cuenta(String id) async {
    final data = await _client.get(
      '/api/v1/clientes/$id/cuenta',
    ) as Map<String, dynamic>;
    return CuentaCorriente.fromJson(data['data'] as Map<String, dynamic>);
  }
}

final clientesServiceProvider = Provider<ClientesService>(
  (ref) => ClientesService(ref.watch(apiClientProvider)),
);

final clientesProvider = FutureProvider<List<Cliente>>(
  (ref) => ref.watch(clientesServiceProvider).listar(),
);

final cuentaCorrienteProvider = FutureProvider.family<CuentaCorriente, String>(
  (ref, id) => ref.watch(clientesServiceProvider).cuenta(id),
);
