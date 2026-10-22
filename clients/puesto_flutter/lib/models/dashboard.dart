/// Modelos para `GET /api/v1/dashboard`.
///
/// El backend (`app/src/lib/server/panel.ts:dashboardResumenForStaff`)
/// devuelve: dias, ventas, ventasPrev, tickets, ticketsPrev, ticketPromedio,
/// enCola, series[], top[], formas[], movimientos[], cola[].
library;

class PuntoSerie {
  const PuntoSerie({
    required this.dia,
    required this.total,
    required this.n,
  });

  /// Etiqueta de tiempo: `YYYY-MM-DD` (por día) o `YYYY-MM-DD HH24`
  /// (por hora cuando `dias=1`).
  final String dia;
  final double total;
  final int n;

  factory PuntoSerie.fromJson(Map<String, dynamic> json) => PuntoSerie(
        dia: json['dia'] as String? ?? '',
        total: (json['total'] as num?)?.toDouble() ?? 0,
        n: (json['n'] as num?)?.toInt() ?? 0,
      );
}

class ProductoTop {
  const ProductoTop({
    required this.nombre,
    required this.cantidad,
    required this.total,
  });

  final String nombre;
  final double cantidad;
  final double total;

  factory ProductoTop.fromJson(Map<String, dynamic> json) => ProductoTop(
        nombre: json['nombre'] as String? ?? '',
        cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
      );
}

class FormaPagoTotal {
  const FormaPagoTotal({
    required this.formaPago,
    required this.total,
    required this.n,
  });

  final String formaPago;
  final double total;
  final int n;

  factory FormaPagoTotal.fromJson(Map<String, dynamic> json) => FormaPagoTotal(
        formaPago: json['formaPago'] as String? ?? '',
        total: (json['total'] as num?)?.toDouble() ?? 0,
        n: (json['n'] as num?)?.toInt() ?? 0,
      );
}

class Movimiento {
  const Movimiento({
    required this.id,
    required this.monto,
    required this.formaPago,
    required this.createdAt,
    required this.cliente,
    required this.numero,
    required this.productos,
  });

  final String id;
  final double monto;
  final String formaPago;
  final String createdAt;
  final String cliente;
  final int? numero;
  final String productos;

  factory Movimiento.fromJson(Map<String, dynamic> json) => Movimiento(
        id: json['id'] as String? ?? '',
        monto: (json['monto'] as num?)?.toDouble() ?? 0,
        formaPago: json['formaPago'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
        cliente: json['cliente'] as String? ?? '',
        numero: (json['numero'] as num?)?.toInt(),
        productos: json['productos'] as String? ?? '',
      );
}

class PedidoCola {
  const PedidoCola({
    required this.id,
    required this.cliente,
    required this.estado,
    required this.createdAt,
    required this.total,
    required this.vendedor,
  });

  final String id;
  final String cliente;
  final String estado;
  final String createdAt;
  final double total;
  final String? vendedor;

  factory PedidoCola.fromJson(Map<String, dynamic> json) => PedidoCola(
        id: json['id'] as String? ?? '',
        cliente: json['cliente'] as String? ?? '',
        estado: json['estado'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
        total: (json['total'] as num?)?.toDouble() ?? 0,
        vendedor: json['vendedor'] as String?,
      );
}

class DashboardResumen {
  const DashboardResumen({
    required this.dias,
    required this.ventas,
    required this.ventasPrev,
    required this.tickets,
    required this.ticketsPrev,
    required this.ticketPromedio,
    required this.enCola,
    required this.series,
    required this.top,
    required this.formas,
    required this.movimientos,
    required this.cola,
  });

  final int dias;
  final double ventas;
  final double ventasPrev;
  final int tickets;
  final int ticketsPrev;
  final double ticketPromedio;
  final int enCola;
  final List<PuntoSerie> series;
  final List<ProductoTop> top;
  final List<FormaPagoTotal> formas;
  final List<Movimiento> movimientos;
  final List<PedidoCola> cola;

  factory DashboardResumen.fromJson(Map<String, dynamic> json) {
    List<T> parseLista<T>(
      dynamic raw,
      T Function(Map<String, dynamic>) fromJson,
    ) {
      if (raw is! List) return const [];
      return raw.whereType<Map<String, dynamic>>().map(fromJson).toList();
    }

    return DashboardResumen(
      dias: (json['dias'] as num?)?.toInt() ?? 7,
      ventas: (json['ventas'] as num?)?.toDouble() ?? 0,
      ventasPrev: (json['ventasPrev'] as num?)?.toDouble() ?? 0,
      tickets: (json['tickets'] as num?)?.toInt() ?? 0,
      ticketsPrev: (json['ticketsPrev'] as num?)?.toInt() ?? 0,
      ticketPromedio: (json['ticketPromedio'] as num?)?.toDouble() ?? 0,
      enCola: (json['enCola'] as num?)?.toInt() ?? 0,
      series: parseLista(json['series'], PuntoSerie.fromJson),
      top: parseLista(json['top'], ProductoTop.fromJson),
      formas: parseLista(json['formas'], FormaPagoTotal.fromJson),
      movimientos: parseLista(json['movimientos'], Movimiento.fromJson),
      cola: parseLista(json['cola'], PedidoCola.fromJson),
    );
  }

  static const vacio = DashboardResumen(
    dias: 7,
    ventas: 0,
    ventasPrev: 0,
    tickets: 0,
    ticketsPrev: 0,
    ticketPromedio: 0,
    enCola: 0,
    series: [],
    top: [],
    formas: [],
    movimientos: [],
    cola: [],
  );

  /// Delta percentual vs el período anterior. `null` si no hay base.
  double? deltaVentasPct() =>
      ventasPrev == 0 ? null : ((ventas - ventasPrev) / ventasPrev) * 100;

  double? deltaTicketsPct() =>
      ticketsPrev == 0 ? null : ((tickets - ticketsPrev) / ticketsPrev) * 100;
}
