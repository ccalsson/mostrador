/// Representa un remito de entrada en el sistema.
class Remito {
  const Remito({
    required this.id,
    this.proveedor,
    required this.fuente,
    required this.estado,
    required this.createdAt,
    this.items = const [],
  });

  final String id;
  final String? proveedor;
  final String fuente;
  final String estado; // 'procesado', 'confirmado'
  final String createdAt;
  final List<RemitoItem> items;

  factory Remito.fromJson(Map<String, dynamic> json) {
    return Remito(
      id: json['id'] as String,
      proveedor: json['proveedor'] as String?,
      fuente: json['fuente'] as String,
      estado: json['estado'] as String,
      createdAt: json['createdAt'] as String,
      items: (json['items'] as List?)
              ?.map((e) => RemitoItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

/// Línea individual de un remito.
class RemitoItem {
  const RemitoItem({
    required this.id,
    required this.descripcionOriginal,
    this.productoId,
    required this.cantidad,
    this.precio,
    required this.confianza,
    required this.confirmado,
  });

  final String id;
  final String descripcionOriginal;
  final String? productoId;
  final double cantidad;
  final double? precio;
  final double confianza; // 0.0 - 1.0 (matching accuracy)
  final bool confirmado; // True si el humano confirmó la línea

  factory RemitoItem.fromJson(Map<String, dynamic> json) {
    return RemitoItem(
      id: json['id'] as String,
      descripcionOriginal: json['descripcionOriginal'] as String,
      productoId: json['productoId'] as String?,
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
      precio: (json['precio'] as num?)?.toDouble(),
      confianza: (json['confianza'] as num?)?.toDouble() ?? 0,
      confirmado: json['confirmado'] as bool? ?? false,
    );
  }
}
