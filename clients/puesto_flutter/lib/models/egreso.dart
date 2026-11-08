class Egreso {
  const Egreso({
    required this.id,
    required this.monto,
    required this.concepto,
    required this.categoria,
    required this.medio,
    required this.usuarioId,
    required this.usuarioNombre,
    required this.creadoAt,
  });

  factory Egreso.fromJson(Map<String, dynamic> json) {
    return Egreso(
      id: json['id'] as String? ?? '',
      monto: (json['monto'] as num?)?.toDouble() ?? 0,
      concepto: json['concepto'] as String? ?? '',
      categoria: json['categoria'] as String? ?? 'alquiler',
      medio: json['medio'] as String? ?? 'efectivo',
      usuarioId: json['usuarioId'] as String? ?? '',
      usuarioNombre: json['usuarioNombre'] as String? ?? '',
      creadoAt: json['creadoAt'] as String? ?? '',
    );
  }

  final String id;
  final double monto;
  final String concepto;
  final String categoria;
  final String medio;
  final String usuarioId;
  final String usuarioNombre;
  final String creadoAt;
}
