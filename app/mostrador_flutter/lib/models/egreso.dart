/// Categorías de egreso permitidas — paridad con la web (caja-egresos.ts).
const List<EgresoCategoria> categoriasEgreso = [
  EgresoCategoria('alquiler', 'Alquiler'),
  EgresoCategoria('combustible', 'Combustible'),
  EgresoCategoria('servicios', 'Servicios'),
  EgresoCategoria('proveedores', 'Proveedores'),
  EgresoCategoria('mercaderia', 'Mercadería'),
  EgresoCategoria('sueldos', 'Sueldos'),
  EgresoCategoria('otros', 'Otros'),
];

/// Medios de pago para un egreso.
enum MedioPago { efectivo, transferencia, otro }

String medioPagoLabel(MedioPago m) {
  switch (m) {
    case MedioPago.efectivo:
      return 'Efectivo';
    case MedioPago.transferencia:
      return 'Transferencia';
    case MedioPago.otro:
      return 'Otro';
  }
}

MedioPago medioPagoFromString(String? s) {
  switch (s) {
    case 'transferencia':
      return MedioPago.transferencia;
    case 'otro':
      return MedioPago.otro;
    default:
      return MedioPago.efectivo;
  }
}

class EgresoCategoria {
  const EgresoCategoria(this.id, this.label);
  final String id;
  final String label;
}

/// Modelo de egreso de caja.
class Egreso {
  const Egreso({
    required this.id,
    required this.categoria,
    required this.concepto,
    required this.monto,
    required this.medio,
    required this.createdAt,
  });

  factory Egreso.fromJson(Map<String, dynamic> j) => Egreso(
        id: j['id'] as String,
        categoria: j['categoria'] as String,
        concepto: j['concepto'] as String? ?? '',
        monto: (j['monto'] as num).toDouble(),
        medio: medioPagoFromString(j['medio'] as String?),
        createdAt: j['createdAt'] as String? ?? j['created_at'] as String? ?? '',
      );

  final String id;
  final String categoria;
  final String concepto;
  final double monto;
  final MedioPago medio;
  final String createdAt;

  /// Solo los egresos en efectivo descuentan del esperado de caja.
  bool get afectaEfectivo => medio == MedioPago.efectivo;

  Map<String, dynamic> toJson() => {
        'id': id,
        'categoria': categoria,
        'concepto': concepto,
        'monto': monto,
        'medio': medio.name,
        'createdAt': createdAt,
      };

  /// Para crear desde formulario (sin id ni createdAt).
  Map<String, dynamic> toCreateJson() => {
        'categoria': categoria,
        'concepto': concepto,
        'monto': monto,
        'medio': medio.name,
      };

  Egreso copyWith({
    String? categoria,
    String? concepto,
    double? monto,
    MedioPago? medio,
  }) =>
      Egreso(
        id: id,
        categoria: categoria ?? this.categoria,
        concepto: concepto ?? this.concepto,
        monto: monto ?? this.monto,
        medio: medio ?? this.medio,
        createdAt: createdAt,
      );

  /// Validación: categoría debe estar en las 7 permitidas.
  static bool categoriaValida(String cat) =>
      categoriasEgreso.any((c) => c.id == cat);
}
