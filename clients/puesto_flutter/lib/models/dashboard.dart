/// Resumen del dashboard según el contrato v1 (`GET /api/v1/dashboard`).
class DashboardResumen {
  const DashboardResumen({
    required this.totalVentas,
    required this.totalCobrado,
    required this.cantidadPedidos,
    required this.cantidadCobros,
    required this.pedidosPendientes,
    required this.stockBajoCount,
    required this.porFormaPago,
    required this.alertasSinLeer,
    this.reputacionPromedio,
    this.ventasPorSucursal = const {},
  });

  /// Monto total de ventas en el período.
  final double totalVentas;

  /// Monto efectivamente cobrado en el período.
  final double totalCobrado;

  /// Cantidad total de pedidos (cualquier estado).
  final int cantidadPedidos;

  /// Cantidad de cobros registrados.
  final int cantidadCobros;

  /// Pedidos aún pendientes de cobro (enviado/en_preparacion/listo).
  final int pedidosPendientes;

  /// Productos con stock bajo el mínimo.
  final int stockBajoCount;

  /// Mapa forma_pago → monto total cobrado.
  final Map<String, double> porFormaPago;

  /// Alertas aún no leídas.
  final int alertasSinLeer;

  /// Promedio de calificaciones de reputación (1–5). Null si el backend
  /// no lo informa; la UI muestra 4.5 como fallback.
  final double? reputacionPromedio;

  /// Mapa sucursal → monto de ventas en el período, para el gráfico
  /// comparativo de sucursales.
  final Map<String, double> ventasPorSucursal;

  factory DashboardResumen.fromJson(Map<String, dynamic> json) {
    Map<String, double> parsePorFormaPago(dynamic raw) {
      if (raw is! Map) return {};
      return {
        for (final entry in raw.entries)
          entry.key as String: (entry.value as num?)?.toDouble() ?? 0,
      };
    }

    Map<String, double> parseVentasSucursal(dynamic raw) {
      if (raw is! Map) return {};
      return {
        for (final entry in raw.entries)
          entry.key as String: (entry.value as num?)?.toDouble() ?? 0,
      };
    }

    return DashboardResumen(
      totalVentas: (json['totalVentas'] as num?)?.toDouble() ?? 0,
      totalCobrado: (json['totalCobrado'] as num?)?.toDouble() ?? 0,
      cantidadPedidos: (json['cantidadPedidos'] as num?)?.toInt() ?? 0,
      cantidadCobros: (json['cantidadCobros'] as num?)?.toInt() ?? 0,
      pedidosPendientes: (json['pedidosPendientes'] as num?)?.toInt() ?? 0,
      stockBajoCount: (json['stockBajoCount'] as num?)?.toInt() ?? 0,
      porFormaPago: parsePorFormaPago(json['porFormaPago']),
      alertasSinLeer: (json['alertasSinLeer'] as num?)?.toInt() ?? 0,
      reputacionPromedio:
          (json['reputacionPromedio'] as num?)?.toDouble(),
      ventasPorSucursal:
          parseVentasSucursal(json['ventasPorSucursal']),
    );
  }

  /// Resumen vacío para el estado de carga.
  static const vacio = DashboardResumen(
    totalVentas: 0,
    totalCobrado: 0,
    cantidadPedidos: 0,
    cantidadCobros: 0,
    pedidosPendientes: 0,
    stockBajoCount: 0,
    porFormaPago: {},
    alertasSinLeer: 0,
  );
}
