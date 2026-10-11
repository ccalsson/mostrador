/// Proveedor del puesto y estado de alta/baja lógica.
class Proveedor {
  const Proveedor({
    required this.id,
    required this.nombre,
    this.cuit,
    this.telefono,
    this.email,
    this.direccion,
    this.observaciones,
    required this.activo,
  });

  final String id;
  final String nombre;
  final String? cuit;
  final String? telefono;
  final String? email;
  final String? direccion;
  final String? observaciones;
  final bool activo;

  factory Proveedor.fromJson(Map<String, dynamic> json) => Proveedor(
    id: json['id'] as String,
    nombre: json['nombre'] as String,
    cuit: json['cuit'] as String?,
    telefono: json['telefono'] as String?,
    email: json['email'] as String?,
    direccion: json['direccion'] as String?,
    observaciones: json['observaciones'] as String?,
    activo: json['activo'] as bool? ?? true,
  );
}
