/// Cliente registrado en la plataforma.
class Cliente {
  const Cliente({
    required this.id,
    required this.nombre,
    this.telefono,
    this.cuentaCorriente = false,
    this.cuit,
    this.direccion,
    this.condicionIva = 'consumidor_final',
    this.activo = true,
    this.saldo = 0,
  });

  final String id;
  final String nombre;
  final String? telefono;
  final bool cuentaCorriente;
  final String? cuit;
  final String? direccion;
  final String condicionIva;
  final bool activo;
  final double saldo;

  factory Cliente.fromJson(Map<String, dynamic> json) {
    return Cliente(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      telefono: json['telefono'] as String?,
      cuentaCorriente: json['cuentaCorriente'] as bool? ?? false,
      cuit: json['cuit'] as String?,
      direccion: json['direccion'] as String?,
      condicionIva: json['condicionIva'] as String? ?? 'consumidor_final',
      activo: json['activo'] as bool? ?? true,
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0,
    );
  }
}
