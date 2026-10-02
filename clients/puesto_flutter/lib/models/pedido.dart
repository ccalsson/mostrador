/// Estados del pedido según el contrato v1 (`app/docs/openapi-v1.yaml`).
enum PedidoEstado {
  borrador('Borrador'),
  enviado('Enviado'),
  enPreparacion('En preparación'),
  listo('Listo'),
  cobrado('Cobrado'),
  anulado('Anulado'),
  entregado('Entregado');

  const PedidoEstado(this.label);

  final String label;

  static PedidoEstado fromApi(String value) {
    return switch (value) {
      'borrador' => PedidoEstado.borrador,
      'enviado' => PedidoEstado.enviado,
      'en_preparacion' => PedidoEstado.enPreparacion,
      'listo' => PedidoEstado.listo,
      'cobrado' => PedidoEstado.cobrado,
      'anulado' => PedidoEstado.anulado,
      'entregado' => PedidoEstado.entregado,
      _ => throw FormatException('Estado de pedido desconocido: $value'),
    };
  }
}

/// Línea de pedido tal como la devuelve el backend (subtotal incluido).
class PedidoItem {
  const PedidoItem({
    required this.id,
    required this.productoId,
    required this.nombre,
    required this.cantidad,
    required this.precioUnitario,
    required this.unidad,
    required this.unidadLabel,
    required this.subtotal,
  });

  final String id;
  final String productoId;
  final String nombre;
  final double cantidad;
  final double precioUnitario;
  final String unidad;
  final String unidadLabel;
  final double subtotal;

  factory PedidoItem.fromJson(Map<String, dynamic> json) {
    return PedidoItem(
      id: json['id'] as String,
      productoId: json['productoId'] as String,
      nombre: json['nombre'] as String? ?? '',
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
      precioUnitario: (json['precioUnitario'] as num?)?.toDouble() ?? 0,
      unidad: json['unidad'] as String? ?? 'kg',
      unidadLabel: json['unidadLabel'] as String? ?? '',
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// Pedido según el contrato v1 (`GET /api/v1/pedidos/:id`). Las fechas llegan
/// como texto de Postgres; se conservan crudas para mostrar.
class Pedido {
  const Pedido({
    required this.id,
    required this.clientUuid,
    required this.vendedorId,
    required this.vendedorNombre,
    required this.clienteId,
    required this.clienteNombre,
    required this.estado,
    required this.nota,
    required this.items,
    required this.total,
    required this.createdAt,
    required this.updatedAt,
    required this.formaPago,
    required this.comprobanteNombre,
  });

  final String id;
  final String clientUuid;
  final String? vendedorId;
  final String? vendedorNombre;
  final String? clienteId;
  final String clienteNombre;
  final PedidoEstado estado;
  final String? nota;
  final List<PedidoItem> items;
  final double total;
  final String createdAt;
  final String updatedAt;
  final String? formaPago;
  final String? comprobanteNombre;

  factory Pedido.fromJson(Map<String, dynamic> json) {
    return Pedido(
      id: json['id'] as String,
      clientUuid: json['clientUuid'] as String? ?? '',
      vendedorId: json['vendedorId'] as String?,
      vendedorNombre: json['vendedorNombre'] as String?,
      clienteId: json['clienteId'] as String?,
      clienteNombre: json['clienteNombre'] as String? ?? 'Mostrador',
      estado: PedidoEstado.fromApi(json['estado'] as String),
      nota: json['nota'] as String?,
      items: [
        for (final item in (json['items'] as List? ?? const []))
          PedidoItem.fromJson(item as Map<String, dynamic>),
      ],
      total: (json['total'] as num?)?.toDouble() ?? 0,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      formaPago: json['formaPago'] as String?,
      comprobanteNombre: json['comprobanteNombre'] as String?,
    );
  }
}
