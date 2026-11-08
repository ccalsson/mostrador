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

/// Datos del trial Pro que la web usa en la vitrina (slider de destacados).
///
/// El backend (`slidesTrial` en `panel.ts`) lo calcula a partir de las
/// suscripciones SaaS activas; si no hay trial devuelve `null` en el JSON.
class TrialInfo {
  const TrialInfo({
    required this.diasRestantes,
    required this.ticketsHoy,
    required this.ticketsTrial,
    required this.producto,
    required this.puesto,
    required this.liderTickets,
    required this.compradores,
    required this.puestos,
    required this.imagenes,
  });

  final int diasRestantes;
  final int ticketsHoy;
  final int ticketsTrial;
  final String? producto;
  final int? puesto;
  final int liderTickets;
  final int compradores;
  final int puestos;
  final TrialImagenes imagenes;

  factory TrialInfo.fromJson(Map<String, dynamic> json) => TrialInfo(
        diasRestantes: (json['diasRestantes'] as num?)?.toInt() ?? 0,
        ticketsHoy: (json['ticketsHoy'] as num?)?.toInt() ?? 0,
        ticketsTrial: (json['ticketsTrial'] as num?)?.toInt() ?? 0,
        producto: json['producto'] as String?,
        puesto: (json['puesto'] as num?)?.toInt(),
        liderTickets: (json['liderTickets'] as num?)?.toInt() ?? 0,
        compradores: (json['compradores'] as num?)?.toInt() ?? 0,
        puestos: (json['puestos'] as num?)?.toInt() ?? 0,
        imagenes: TrialImagenes.fromJson(
          json['imagenes'] as Map<String, dynamic>? ?? const {},
        ),
      );
}

class TrialImagenes {
  const TrialImagenes({
    this.resultados,
    this.producto,
    this.ranking,
    this.actividad,
    this.cuenta,
  });

  final String? resultados;
  final String? producto;
  final String? ranking;
  final String? actividad;
  final String? cuenta;

  factory TrialImagenes.fromJson(Map<String, dynamic> json) => TrialImagenes(
        resultados: json['resultados'] as String?,
        producto: json['producto'] as String?,
        ranking: json['ranking'] as String?,
        actividad: json['actividad'] as String?,
        cuenta: json['cuenta'] as String?,
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
    this.trial,
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
  final TrialInfo? trial;

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
      trial: json['trial'] is Map<String, dynamic>
          ? TrialInfo.fromJson(json['trial'] as Map<String, dynamic>)
          : null,
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
    trial: null,
  );

  /// Delta percentual vs el período anterior. `null` si no hay base.
  double? deltaVentasPct() =>
      ventasPrev == 0 ? null : ((ventas - ventasPrev) / ventasPrev) * 100;

  double? deltaTicketsPct() =>
      ticketsPrev == 0 ? null : ((tickets - ticketsPrev) / ticketsPrev) * 100;
}
