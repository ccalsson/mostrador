/// Modelos para reportes de ventas y ranking de cargadores según los endpoints:
/// - `GET /api/v1/reportes/productos`
/// - `GET /api/v1/reportes/productos/:id/historial`
/// - `GET /api/v1/cargadores/ranking`
library;

class ReporteVentaProducto {
  const ReporteVentaProducto({
    required this.productoId,
    required this.nombre,
    required this.cantidad,
    required this.total,
  });

  final String productoId;
  final String nombre;
  final double cantidad;
  final double total;

  factory ReporteVentaProducto.fromJson(Map<String, dynamic> json) {
    return ReporteVentaProducto(
      productoId: json['productoId'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0.0,
      total: (json['total'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class ReporteProductosResumen {
  const ReporteProductosResumen({
    required this.semana,
    required this.mes,
  });

  final List<ReporteVentaProducto> semana;
  final List<ReporteVentaProducto> mes;

  factory ReporteProductosResumen.fromJson(Map<String, dynamic> json) {
    List<ReporteVentaProducto> parseLista(dynamic raw) {
      if (raw is! List) return const [];
      return raw
          .whereType<Map<String, dynamic>>()
          .map(ReporteVentaProducto.fromJson)
          .toList();
    }

    return ReporteProductosResumen(
      semana: parseLista(json['semana']),
      mes: parseLista(json['mes']),
    );
  }

  static const vacio = ReporteProductosResumen(semana: [], mes: []);
}

class HistorialVentaDia {
  const HistorialVentaDia({
    required this.dia,
    required this.cantidad,
    required this.total,
  });

  final String dia;
  final double cantidad;
  final double total;

  factory HistorialVentaDia.fromJson(Map<String, dynamic> json) {
    return HistorialVentaDia(
      dia: json['dia'] as String? ?? '',
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0.0,
      total: (json['total'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class HistorialProducto {
  const HistorialProducto({required this.dias});

  final List<HistorialVentaDia> dias;

  factory HistorialProducto.fromJson(Map<String, dynamic> json) {
    final raw = json['dias'];
    if (raw is! List) return const HistorialProducto(dias: []);
    return HistorialProducto(
      dias: raw
          .whereType<Map<String, dynamic>>()
          .map(HistorialVentaDia.fromJson)
          .toList(),
    );
  }

  static const vacio = HistorialProducto(dias: []);
}

class RankingCargadorItem {
  const RankingCargadorItem({
    required this.puesto,
    required this.nombre,
    required this.nivel,
    required this.puntos,
    required this.score,
    required this.recorridosCompletados,
  });

  final int puesto;
  final String nombre;
  final String nivel;
  final int puntos;
  final double score;
  final int recorridosCompletados;

  factory RankingCargadorItem.fromJson(Map<String, dynamic> json) {
    return RankingCargadorItem(
      puesto: (json['puesto'] as num?)?.toInt() ?? 0,
      nombre: json['nombre'] as String? ?? 'Cargador',
      nivel: json['nivel'] as String? ?? 'Inicial',
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
      recorridosCompletados:
          (json['recorridosCompletados'] as num?)?.toInt() ?? 0,
    );
  }
}

class RankingCargadores {
  const RankingCargadores({required this.ranking});

  final List<RankingCargadorItem> ranking;

  factory RankingCargadores.fromJson(Map<String, dynamic> json) {
    final raw = json['ranking'];
    if (raw is! List) return const RankingCargadores(ranking: []);
    return RankingCargadores(
      ranking: raw
          .whereType<Map<String, dynamic>>()
          .map(RankingCargadorItem.fromJson)
          .toList(),
    );
  }

  static const vacio = RankingCargadores(ranking: []);
}
