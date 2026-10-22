class EscritorioDueno {
  const EscritorioDueno({
    required this.puestoVisible,
    required this.margen,
    required this.deudas,
    required this.cierres,
    required this.lista,
  });

  factory EscritorioDueno.fromJson(Map<String, dynamic> json) {
    return EscritorioDueno(
      puestoVisible: json['puestoVisible'] as bool? ?? false,
      margen: Margen.fromJson(json['margen'] as Map<String, dynamic>? ?? {}),
      deudas: (json['deudas'] as List<dynamic>? ?? [])
          .map((e) => Deuda.fromJson(e as Map<String, dynamic>))
          .toList(),
      cierres: (json['cierres'] as List<dynamic>? ?? [])
          .map((e) => Cierre.fromJson(e as Map<String, dynamic>))
          .toList(),
      lista: Lista.fromJson(json['lista'] as Map<String, dynamic>? ?? {}),
    );
  }

  final bool puestoVisible;
  final Margen margen;
  final List<Deuda> deudas;
  final List<Cierre> cierres;
  final Lista lista;
}

class Margen {
  const Margen({
    required this.cobrado,
    required this.costo,
    required this.diferencia,
    required this.sinPrecio,
    required this.serie,
    required this.entradas,
  });

  factory Margen.fromJson(Map<String, dynamic> json) {
    return Margen(
      cobrado: (json['cobrado'] as num?)?.toDouble() ?? 0,
      costo: (json['costo'] as num?)?.toDouble() ?? 0,
      diferencia: (json['diferencia'] as num?)?.toDouble() ?? 0,
      sinPrecio: json['sinPrecio'] as int? ?? 0,
      serie: (json['serie'] as List<dynamic>? ?? [])
          .map((e) => SerieDia.fromJson(e as Map<String, dynamic>))
          .toList(),
      entradas: (json['entradas'] as List<dynamic>? ?? [])
          .map((e) => EntradaRemito.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final double cobrado;
  final double costo;
  final double diferencia;
  final int sinPrecio;
  final List<SerieDia> serie;
  final List<EntradaRemito> entradas;
}

class SerieDia {
  const SerieDia({required this.dia, required this.cobrado, required this.costo});

  factory SerieDia.fromJson(Map<String, dynamic> json) {
    return SerieDia(
      dia: json['dia'] as String? ?? '',
      cobrado: (json['cobrado'] as num?)?.toDouble() ?? 0,
      costo: (json['costo'] as num?)?.toDouble() ?? 0,
    );
  }

  final String dia;
  final double cobrado;
  final double costo;
}

class EntradaRemito {
  const EntradaRemito({
    required this.id,
    required this.proveedor,
    required this.cuando,
    required this.costo,
    required this.lineas,
  });

  factory EntradaRemito.fromJson(Map<String, dynamic> json) {
    return EntradaRemito(
      id: json['id'] as String? ?? '',
      proveedor: json['proveedor'] as String? ?? '',
      cuando: json['cuando'] as String? ?? '',
      costo: (json['costo'] as num?)?.toDouble() ?? 0,
      lineas: json['lineas'] as int? ?? 0,
    );
  }

  final String id;
  final String proveedor;
  final String cuando;
  final double costo;
  final int lineas;
}

class Deuda {
  const Deuda({required this.id, required this.nombre, required this.saldo});

  factory Deuda.fromJson(Map<String, dynamic> json) {
    return Deuda(
      id: json['id'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0,
    );
  }

  final String id;
  final String nombre;
  final double saldo;
}

class Cierre {
  const Cierre({
    required this.id,
    required this.abiertoAt,
    required this.cerradoAt,
    required this.esperado,
    required this.real,
    required this.diferencia,
    required this.notas,
    required this.quien,
  });

  factory Cierre.fromJson(Map<String, dynamic> json) {
    return Cierre(
      id: json['id'] as String? ?? '',
      abiertoAt: json['abiertoAt'] as String? ?? '',
      cerradoAt: json['cerradoAt'] as String? ?? '',
      esperado: (json['esperado'] as num?)?.toDouble() ?? 0,
      real: (json['real'] as num?)?.toDouble() ?? 0,
      diferencia: (json['diferencia'] as num?)?.toDouble() ?? 0,
      notas: json['notas'] as String? ?? '',
      quien: json['quien'] as String? ?? '',
    );
  }

  final String id;
  final String abiertoAt;
  final String cerradoAt;
  final double esperado;
  final double real;
  final double diferencia;
  final String notas;
  final String quien;
}

class Lista {
  const Lista({required this.ocultos, required this.productos});

  factory Lista.fromJson(Map<String, dynamic> json) {
    return Lista(
      ocultos: json['ocultos'] as int? ?? 0,
      productos: (json['productos'] as List<dynamic>? ?? [])
          .map((e) => ProductoPublicado.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final int ocultos;
  final List<ProductoPublicado> productos;
}

class ProductoPublicado {
  const ProductoPublicado({
    required this.id,
    required this.nombre,
    required this.precio,
    required this.stock,
    required this.unidad,
  });

  factory ProductoPublicado.fromJson(Map<String, dynamic> json) {
    return ProductoPublicado(
      id: json['id'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      precio: (json['precio'] as num?)?.toDouble() ?? 0,
      stock: (json['stock'] as num?)?.toDouble() ?? 0,
      unidad: json['unidad'] as String? ?? '',
    );
  }

  final String id;
  final String nombre;
  final double precio;
  final double stock;
  final String unidad;
}
