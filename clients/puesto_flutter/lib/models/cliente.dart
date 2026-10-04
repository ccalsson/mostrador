/// Cliente registrado en la plataforma.
class Cliente {
  const Cliente({
    required this.id,
    required this.nombre,
    this.telefono,
    this.cuentaCorriente = false,
  });

  final String id;
  final String nombre;
  final String? telefono;
  final bool cuentaCorriente;

  factory Cliente.fromJson(Map<String, dynamic> json) {
    return Cliente(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      telefono: json['telefono'] as String?,
      cuentaCorriente: json['cuentaCorriente'] as bool? ?? false,
    );
  }
}
