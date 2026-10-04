/// Alerta del tablero según el contrato v1 (`GET /api/v1/alertas`).
class Alerta {
  const Alerta({
    required this.id,
    required this.tipo,
    required this.mensaje,
    required this.leida,
    required this.creada,
  });

  final String id;
  final String tipo;
  final String mensaje;
  final bool leida;

  /// Texto de fecha tal como llega del backend; formatear con `fechaCorta`.
  final String creada;

  factory Alerta.fromJson(Map<String, dynamic> json) {
    return Alerta(
      id: json['id'] as String,
      tipo: json['tipo'] as String? ?? '',
      mensaje: json['mensaje'] as String? ?? '',
      leida: json['leida'] as bool? ?? false,
      creada: json['createdAt'] as String? ?? '',
    );
  }
}
