/// Modelos para `GET /api/v1/mesa-turno`.
///
/// El backend (`app/src/lib/server/mesa-turno.ts:mesaTurnoForStaff`)
/// devuelve los 5 indicadores compactos de la mesa del turno:
/// cobrado hoy, pedidos en curso, stock bajo, pedidos de la app
/// y productos publicados en Mercado.
library;

/// Indicadores de la mesa del turno.
class MesaTurno {
  const MesaTurno({
    required this.cobrado,
    required this.enCurso,
    required this.stockBajo,
    required this.pedidosApp,
    required this.publicados,
  });

  /// Suma de cobros no anulados del día en curso.
  final double cobrado;

  /// Pedidos con estado 'enviado' o 'en_preparacion'.
  final int enCurso;

  /// Productos activos con stock <= stock_minimo.
  final int stockBajo;

  /// Pedidos de origen mercado_al_toque del día.
  final int pedidosApp;

  /// Productos activos con publicado_online = true.
  final int publicados;

  factory MesaTurno.fromJson(Map<String, dynamic> json) => MesaTurno(
        cobrado: (json['cobrado'] as num?)?.toDouble() ?? 0,
        enCurso: (json['enCurso'] as num?)?.toInt() ?? 0,
        stockBajo: (json['stockBajo'] as num?)?.toInt() ?? 0,
        pedidosApp: (json['pedidosApp'] as num?)?.toInt() ?? 0,
        publicados: (json['publicados'] as num?)?.toInt() ?? 0,
      );

  static const vacio = MesaTurno(
    cobrado: 0,
    enCurso: 0,
    stockBajo: 0,
    pedidosApp: 0,
    publicados: 0,
  );
}
