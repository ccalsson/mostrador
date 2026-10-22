/// Modelos de mensajería pedido↔cliente según
/// `GET /api/v1/mensajes/conversaciones` y `GET /api/v1/pedidos/:id/mensajes`.
library;

class ConversacionResumen {
  const ConversacionResumen({
    required this.pedidoId,
    required this.clienteNombre,
    required this.estado,
    required this.pedidoAt,
    required this.ultimo,
    required this.ultimoDe,
    required this.ultimoAt,
    required this.sinLeer,
  });

  final String pedidoId;
  final String clienteNombre;
  final String estado;
  final String pedidoAt;
  final String ultimo;
  final String ultimoDe;
  final String ultimoAt;
  final int sinLeer;

  factory ConversacionResumen.fromJson(Map<String, dynamic> json) =>
      ConversacionResumen(
        pedidoId: json['pedidoId'] as String? ?? '',
        clienteNombre: json['clienteNombre'] as String? ?? '',
        estado: json['estado'] as String? ?? '',
        pedidoAt: json['pedidoAt'] as String? ?? '',
        ultimo: json['ultimo'] as String? ?? '',
        ultimoDe: json['ultimoDe'] as String? ?? 'cliente',
        ultimoAt: json['ultimoAt'] as String? ?? '',
        sinLeer: (json['sinLeer'] as num?)?.toInt() ?? 0,
      );
}

class Mensaje {
  const Mensaje({
    required this.id,
    required this.emisor,
    required this.cuerpo,
    required this.createdAt,
  });

  final String id;

  /// `cliente` o `negocio`.
  final String emisor;
  final String cuerpo;
  final String createdAt;

  factory Mensaje.fromJson(Map<String, dynamic> json) => Mensaje(
        id: json['id'] as String? ?? '',
        emisor: json['emisor'] as String? ?? 'cliente',
        cuerpo: json['cuerpo'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );
}

class MensajesPagina {
  const MensajesPagina({required this.mensajes, required this.hayMas});

  final List<Mensaje> mensajes;
  final bool hayMas;

  factory MensajesPagina.fromJson(Map<String, dynamic> json) {
    final raw = json['mensajes'];
    return MensajesPagina(
      mensajes: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(Mensaje.fromJson)
              .toList()
          : const [],
      hayMas: json['hayMas'] as bool? ?? false,
    );
  }

  static const vacio = MensajesPagina(mensajes: [], hayMas: false);
}
