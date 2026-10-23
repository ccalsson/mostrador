/// Cliente registrado en la plataforma.
class Cliente {
  const Cliente({
    required this.id,
    required this.nombre,
    this.telefono,
    this.email,
    this.cuentaCorriente = false,
    this.cuit,
    this.direccion,
    this.condicionIva = 'consumidor_final',
    this.activo = true,
    this.saldo = 0,
    this.origen = 'puesto',
    this.userId,
  });

  final String id;
  final String nombre;
  final String? telefono;
  final String? email;
  final bool cuentaCorriente;
  final String? cuit;
  final String? direccion;
  final String condicionIva;
  final bool activo;
  final double saldo;

  /// Origen del cliente: 'puesto' (cliente propio) o 'mercado' (comprador
  /// de Mercado al Toque, read-only).
  final String origen;

  /// ID del usuario de la app (solo compradores Mercado).
  final String? userId;

  bool get esMercado => origen == 'mercado';

  factory Cliente.fromJson(Map<String, dynamic> json) {
    return Cliente(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      telefono: json['telefono'] as String?,
      email: json['email'] as String?,
      cuentaCorriente: json['cuentaCorriente'] as bool? ?? false,
      cuit: json['cuit'] as String?,
      direccion: json['direccion'] as String?,
      condicionIva: json['condicionIva'] as String? ?? 'consumidor_final',
      activo: json['activo'] as bool? ?? true,
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0,
      origen: json['origen'] as String? ?? 'puesto',
      userId: json['userId'] as String?,
    );
  }
}
