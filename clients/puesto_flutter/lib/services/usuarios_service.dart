import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../models/usuario.dart';
import '../models/staff_session.dart';

/// Entrada para crear un usuario (`POST /api/v1/usuarios`).
class UsuarioInput {
  const UsuarioInput({
    required this.nombre,
    required this.email,
    required this.password,
    required this.rol,
  });

  final String nombre;
  final String email;
  final String password;
  final Rol rol;

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'email': email,
        'password': password,
        'rol': rol.name,
      };
}

/// Alta y activación/desactivación de usuarios (`GET/POST /api/v1/usuarios`).
class UsuariosService {
  UsuariosService(this._client);

  final ApiClient _client;

  Future<List<Usuario>> listar() async {
    final data = await _client.get('/api/v1/usuarios') as Map<String, dynamic>;
    return (data['data'] as List)
        .map((json) => Usuario.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// `POST /api/v1/usuarios` — alta con nombre, email, password y rol.
  /// El backend responde 201 con `{ ok: true }` (DataOk), sin el usuario.
  Future<void> crear(UsuarioInput input) async {
    await _client.post(
      '/api/v1/usuarios',
      body: input.toJson(),
    );
  }

  /// `POST /api/v1/usuarios/{id}/toggle` — activa o desactiva el usuario.
  Future<void> toggle(String id, {required bool activo}) async {
    await _client.post('/api/v1/usuarios/$id/toggle', body: {'activo': activo});
  }
}

final usuariosServiceProvider = Provider<UsuariosService>(
  (ref) => UsuariosService(ref.watch(apiClientProvider)),
);

final usuariosProvider = FutureProvider<List<Usuario>>(
  (ref) => ref.watch(usuariosServiceProvider).listar(),
);
