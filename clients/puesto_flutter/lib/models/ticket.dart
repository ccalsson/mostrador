/// Ticket emitido (`GET /api/v1/cobros/:id/ticket`), listo para mostrar.
class Ticket {
  const Ticket({
    required this.id,
    required this.numero,
    required this.contenido,
    required this.createdAt,
  });

  final String id;
  final int numero;
  final TicketContenido contenido;
  final String createdAt;

  factory Ticket.fromJson(Map<String, dynamic> json) {
    return Ticket(
      id: json['id'] as String,
      numero: (json['numero'] as num?)?.toInt() ?? 0,
      contenido: TicketContenido.fromJson(
        json['contenido'] as Map<String, dynamic>? ?? const {},
      ),
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

/// Snapshot imprimible; el emisor puede variar (venta o seed), así que los
/// campos se leen con tolerancia.
class TicketContenido {
  const TicketContenido({
    required this.puesto,
    required this.numero,
    required this.fecha,
    required this.cliente,
    required this.items,
    required this.total,
    required this.formaPago,
    required this.recibido,
    required this.vuelto,
    required this.pie,
  });

  final String puesto;
  final int numero;
  final String fecha;
  final String cliente;
  final List<TicketItem> items;
  final double total;
  final String formaPago;
  final double recibido;
  final double vuelto;
  final String pie;

  factory TicketContenido.fromJson(Map<String, dynamic> json) {
    return TicketContenido(
      puesto: json['puesto'] as String? ?? '',
      numero: (json['numero'] as num?)?.toInt() ?? 0,
      fecha: json['fecha'] as String? ?? '',
      cliente: json['cliente'] as String? ?? '',
      items: [
        for (final item in (json['items'] as List? ?? const []))
          TicketItem.fromJson(item as Map<String, dynamic>),
      ],
      total: (json['total'] as num?)?.toDouble() ?? 0,
      formaPago: json['formaPago'] as String? ?? '',
      recibido: (json['recibido'] as num?)?.toDouble() ?? 0,
      vuelto: (json['vuelto'] as num?)?.toDouble() ?? 0,
      pie: json['pie'] as String? ?? '',
    );
  }
}

class TicketItem {
  const TicketItem({
    required this.nombre,
    required this.cantidad,
    required this.unidad,
    required this.precio,
    required this.subtotal,
  });

  final String nombre;
  final double cantidad;
  final String unidad;
  final double precio;
  final double subtotal;

  factory TicketItem.fromJson(Map<String, dynamic> json) {
    return TicketItem(
      nombre: json['nombre'] as String? ?? '',
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
      unidad: json['unidad'] as String? ?? '',
      precio: (json['precio'] as num?)?.toDouble() ?? 0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
    );
  }
}
