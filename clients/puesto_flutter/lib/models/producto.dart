/// Producto del catálogo según el contrato v1 (`GET /api/v1/catalogo`).
class Producto {
  const Producto({
    required this.id,
    required this.nombre,
    required this.unidad,
    required this.unidadLabel,
    required this.precio,
    required this.stock,
    required this.stockMinimo,
    required this.alias,
    required this.activo,
    required this.stockBajo,
  });

  final String id;
  final String nombre;
  final String unidad;
  final String unidadLabel;
  final double precio;
  final double stock;
  final double stockMinimo;
  final List<String> alias;
  final bool activo;
  final bool stockBajo;

  factory Producto.fromJson(Map<String, dynamic> json) {
    return Producto(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      unidad: json['unidad'] as String? ?? 'kg',
      unidadLabel: json['unidadLabel'] as String? ?? '',
      precio: (json['precio'] as num?)?.toDouble() ?? 0,
      stock: (json['stock'] as num?)?.toDouble() ?? 0,
      stockMinimo: (json['stockMinimo'] as num?)?.toDouble() ?? 0,
      alias: (json['alias'] as List?)?.cast<String>() ?? const [],
      activo: json['activo'] as bool? ?? true,
      stockBajo: json['stockBajo'] as bool? ?? false,
    );
  }
}

/// Resultado de sincronización: productos + versión para próximos `since`.
class Catalogo {
  const Catalogo({required this.productos, required this.version});

  final List<Producto> productos;
  final String? version;
}
