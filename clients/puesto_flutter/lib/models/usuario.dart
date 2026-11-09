import 'staff_session.dart';

/// Usuario del staff según el contrato v1 (`GET /api/v1/usuarios`).
class Usuario {
  const Usuario({
    required this.id,
    required this.nombre,
    required this.email,
    required this.rol,
    required this.activo,
    this.puedeCambiar = false,
  });

  final String id;
  final String nombre;
  final String email;
  final Rol rol;
  final bool activo;

  /// `GET /api/v1/usuarios` devuelve la columna como `puede_cambiar`, aunque el
  /// body de `cambio-sucursal` usa `puedeCambiar`.
  final bool puedeCambiar;

  factory Usuario.fromJson(Map<String, dynamic> json) {
    return Usuario(
      id: json['id'] as String,
      nombre: json['nombre'] as String? ?? '',
      email: json['email'] as String? ?? '',
      rol: Rol.fromApi(json['rol'] as String? ?? 'vendedor'),
      activo: json['activo'] as bool? ?? true,
      puedeCambiar: json['puede_cambiar'] as bool? ?? false,
    );
  }
}
