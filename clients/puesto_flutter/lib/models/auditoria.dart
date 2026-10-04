/// Registro de auditoría (logs) de acciones realizadas.
class Auditoria {
  const Auditoria({
    required this.id,
    this.usuarioNombre,
    required this.accion,
    required this.entidad,
    required this.detalle,
    required this.createdAt,
  });

  final String id;
  final String? usuarioNombre;
  final String accion;
  final String entidad;
  final String detalle;
  final String createdAt;

  factory Auditoria.fromJson(Map<String, dynamic> json) {
    return Auditoria(
      id: json['id'] as String,
      usuarioNombre: json['usuarioNombre'] as String?,
      accion: json['accion'] as String,
      entidad: json['entidad'] as String,
      detalle: json['detalle'] as String? ?? '{}',
      createdAt: json['createdAt'] as String,
    );
  }
}
