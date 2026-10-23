import 'dart:convert';

/// Pedido pendiente de enviar al backend. Se persiste en disco para
/// sobrevivir a cierres de la app y se reintenta hasta [maxReintentos] veces.
class PedidoPendiente {
  const PedidoPendiente({
    required this.clientUuid,
    required this.items,
    required this.timestamp,
    this.reintentos = 0,
    this.clienteNombre = 'Mostrador',
    this.nota,
  });

  final String clientUuid;
  final List<PedidoPendienteItem> items;
  final DateTime timestamp;
  final int reintentos;
  final String clienteNombre;
  final String? nota;

  /// Máximo de reintentos antes de descartar y notificar fallo.
  static const int maxReintentos = 3;

  bool get agotado => reintentos >= maxReintentos;

  Map<String, dynamic> toJson() => {
        'clientUuid': clientUuid,
        'items': [for (final item in items) item.toJson()],
        'timestamp': timestamp.toIso8601String(),
        'reintentos': reintentos,
        'clienteNombre': clienteNombre,
        'nota': nota,
      };

  factory PedidoPendiente.fromJson(Map<String, dynamic> json) {
    return PedidoPendiente(
      clientUuid: json['clientUuid'] as String,
      items: [
        for (final item in (json['items'] as List))
          PedidoPendienteItem.fromJson(item as Map<String, dynamic>),
      ],
      timestamp: DateTime.parse(json['timestamp'] as String),
      reintentos: (json['reintentos'] as int?) ?? 0,
      clienteNombre: (json['clienteNombre'] as String?) ?? 'Mostrador',
      nota: json['nota'] as String?,
    );
  }

  PedidoPendiente conRetryIncrementado() => PedidoPendiente(
        clientUuid: clientUuid,
        items: items,
        timestamp: timestamp,
        reintentos: reintentos + 1,
        clienteNombre: clienteNombre,
        nota: nota,
      );
}

/// Línea de un pedido pendiente.
class PedidoPendienteItem {
  const PedidoPendienteItem({
    required this.productoId,
    required this.cantidad,
  });

  final String productoId;
  final int cantidad;

  Map<String, dynamic> toJson() => {
        'productoId': productoId,
        'cantidad': cantidad,
      };

  factory PedidoPendienteItem.fromJson(Map<String, dynamic> json) {
    return PedidoPendienteItem(
      productoId: json['productoId'] as String,
      cantidad: (json['cantidad'] as num).toInt(),
    );
  }
}

/// Serializa/deserializa la cola completa a JSON.
List<PedidoPendiente> decodificarCola(String json) {
  final lista = jsonDecode(json) as List;
  return [
    for (final item in lista)
      PedidoPendiente.fromJson(item as Map<String, dynamic>),
  ];
}

String codificarCola(List<PedidoPendiente> pedidos) {
  return jsonEncode([for (final p in pedidos) p.toJson()]);
}
