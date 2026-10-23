/// Rol del usuario según el contrato v1 (`docs/api-v1.md`).
enum Rol {
  admin('Dueño'),
  cajero('Caja'),
  vendedor('Vendedor');

  const Rol(this.label);

  final String label;

  static Rol fromApi(String value) {
    return switch (value) {
      'admin' => Rol.admin,
      'cajero' => Rol.cajero,
      'vendedor' => Rol.vendedor,
      _ => throw FormatException('Rol desconocido: $value'),
    };
  }
}

/// Usuario autenticado que devuelve `GET /api/v1/session`.
class Staff {
  const Staff({
    required this.id,
    required this.nombre,
    required this.rol,
    this.puedeCambiar = false,
  });

  final String id;
  final String nombre;
  final Rol rol;
  final bool puedeCambiar;

  factory Staff.fromJson(Map<String, dynamic> json) {
    return Staff(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      rol: Rol.fromApi(json['rol'] as String),
      puedeCambiar: json['puedeCambiar'] as bool? ?? false,
    );
  }
}

/// Respuesta completa de `GET /api/v1/session`.
class StaffSession {
  const StaffSession({
    required this.staff,
    required this.tenantId,
    this.casaId,
    this.sucursal,
    this.contextoProtegido = false,
  });

  final Staff staff;
  final String tenantId;
  final String? casaId;
  final ({String id, String nombre})? sucursal;
  final bool contextoProtegido;

  String get nombreSucursal => sucursal?.nombre ?? 'Casa matriz';

  factory StaffSession.fromJson(Map<String, dynamic> json) {
    final sucursal = json['sucursal'] as Map<String, dynamic>?;
    return StaffSession(
      staff: Staff.fromJson(json['staff'] as Map<String, dynamic>),
      tenantId: json['tenantId'] as String,
      casaId: json['casaId'] as String?,
      sucursal: sucursal == null
          ? null
          : (
              id: sucursal['id'] as String,
              nombre: sucursal['nombre'] as String,
            ),
      contextoProtegido: json['contextoProtegido'] == true,
    );
  }
}
