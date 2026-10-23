/// Modelos para la sugerencia de reposición según historial de ventas.
/// Endpoint: `GET /api/v1/reposicion`
library;

class ReposicionSugerencia {
  const ReposicionSugerencia({
    required this.productoId,
    required this.nombre,
    required this.cantidadSugerida,
    required this.stockActual,
    required this.promedioDiario,
  });

  final String productoId;
  final String nombre;
  final double cantidadSugerida;
  final double stockActual;
  final double promedioDiario;

  /// Un producto es crítico cuando la cantidad sugerida supera el doble
  /// del promedio diario (necesita más de 2 semanas de venta para
  /// reponerse).
  bool get esCritico => cantidadSugerida > 2 * promedioDiario;

  factory ReposicionSugerencia.fromJson(Map<String, dynamic> json) {
    return ReposicionSugerencia(
      productoId: json['productoId'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      cantidadSugerida: (json['cantidadSugerida'] as num?)?.toDouble() ?? 0.0,
      stockActual: (json['stockActual'] as num?)?.toDouble() ?? 0.0,
      promedioDiario: (json['promedioDiario'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class ReposicionResultado {
  const ReposicionResultado({
    required this.dias,
    required this.sugerencias,
  });

  final int dias;
  final List<ReposicionSugerencia> sugerencias;

  factory ReposicionResultado.fromJson(Map<String, dynamic> json) {
    final raw = json['sugerencias'];
    final lista = raw is List
        ? raw
            .whereType<Map<String, dynamic>>()
            .map(ReposicionSugerencia.fromJson)
            .toList()
        : <ReposicionSugerencia>[];
    return ReposicionResultado(
      dias: (json['dias'] as num?)?.toInt() ?? 0,
      sugerencias: lista,
    );
  }

  static const vacio = ReposicionResultado(dias: 0, sugerencias: []);
}
