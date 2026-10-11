/// Lectura de OCR canónica (`POST /api/v1/remitos/ocr`). El cliente no interpreta el papel.
class RemitoOcrLectura {
  const RemitoOcrLectura({this.proveedor, required this.lineas});

  final String? proveedor;
  final List<RemitoOcrLinea> lineas;

  factory RemitoOcrLectura.fromJson(Map<String, dynamic> json) {
    return RemitoOcrLectura(
      proveedor: json['proveedor'] as String?,
      lineas: [
        for (final item in json['lineas'] as List? ?? const [])
          RemitoOcrLinea.fromJson(item as Map<String, dynamic>),
      ],
    );
  }
}

class RemitoOcrLinea {
  const RemitoOcrLinea({
    required this.descripcion,
    required this.cantidad,
    this.precio,
  });

  final String descripcion;
  final double cantidad;
  final double? precio;

  factory RemitoOcrLinea.fromJson(Map<String, dynamic> json) {
    return RemitoOcrLinea(
      descripcion: json['descripcion'] as String? ?? '',
      cantidad: (json['cantidad'] as num?)?.toDouble() ?? 0,
      precio: (json['precio'] as num?)?.toDouble(),
    );
  }
}

class RemitoLineaAlta {
  const RemitoLineaAlta({required this.descripcion, required this.cantidad});

  final String descripcion;
  final double cantidad;

  Map<String, dynamic> toJson() => {
        'descripcion': descripcion,
        'cantidad': cantidad,
      };
}

class RemitoImagen {
  const RemitoImagen({
    required this.bytes,
    required this.mimeType,
    required this.nombre,
  });

  final List<int> bytes;
  final String mimeType;
  final String nombre;
}
