/// Tipos de pieza creativa que el backend soporta. El contrato actual habilita
/// `banner` y `push`; los restantes se listan como placeholders del plan
/// extendido (copy, post, email, descripcion, etiqueta, historia).
enum TipoCreativo {
  banner,
  copy,
  push,
  post,
  email,
  descripcion,
  etiqueta,
  historia;

  String get nombre => switch (this) {
    TipoCreativo.banner => 'Banner',
    TipoCreativo.copy => 'Copy',
    TipoCreativo.push => 'Push',
    TipoCreativo.post => 'Post',
    TipoCreativo.email => 'Email',
    TipoCreativo.descripcion => 'Descripción',
    TipoCreativo.etiqueta => 'Etiqueta',
    TipoCreativo.historia => 'Historia',
  };

  static TipoCreativo? desde(String? valor) {
    if (valor == null) return null;
    for (final tipo in TipoCreativo.values) {
      if (tipo.name == valor) return tipo;
    }
    return null;
  }
}

/// Estado del pedido creativo según el backend (`creativos_pedidos.estado`).
enum EstadoCreativo {
  borrador,
  listo,
  enviado,
  eliminado;

  String get nombre => switch (this) {
    EstadoCreativo.borrador => 'Borrador',
    EstadoCreativo.listo => 'Listo',
    EstadoCreativo.enviado => 'Enviado',
    EstadoCreativo.eliminado => 'Eliminado',
  };

  static EstadoCreativo? desde(String? valor) {
    if (valor == null) return null;
    for (final estado in EstadoCreativo.values) {
      if (estado.name == valor) return estado;
    }
    return null;
  }
}

/// Variante de texto generada por IA para un pedido creativo. Cada pedido
/// produce varias variantes (título + texto + imagen compartida).
class VarianteCreativo {
  const VarianteCreativo({
    required this.id,
    required this.n,
    required this.titulo,
    required this.texto,
    required this.imagen,
  });

  final String id;
  final int n;
  final String titulo;
  final String texto;

  /// URL o data-URI de la imagen generada.
  final String imagen;

  factory VarianteCreativo.fromJson(Map<String, dynamic> json) =>
      VarianteCreativo(
        id: json['id'] as String? ?? '',
        n: (json['n'] as num?)?.toInt() ?? 0,
        titulo: json['titulo'] as String? ?? '',
        texto: json['texto'] as String? ?? '',
        imagen: json['imagen'] as String? ?? '',
      );
}

/// Pedido creativo completo. El backend devuelve la lista de pedidos dentro
/// de `GET /api/v1/creativos` con sus variantes asociadas.
class Creativo {
  const Creativo({
    required this.id,
    required this.tipo,
    required this.estado,
    required this.brief,
    required this.creditos,
    required this.createdAt,
    required this.variantes,
  });

  final String id;
  final TipoCreativo tipo;
  final EstadoCreativo estado;
  final String brief;
  final int creditos;
  final String createdAt;
  final List<VarianteCreativo> variantes;

  factory Creativo.fromJson(Map<String, dynamic> json) {
    final variantesRaw = json['variantes'] as List? ?? const [];
    return Creativo(
      id: json['id'] as String? ?? '',
      tipo: TipoCreativo.desde(json['formato'] as String?) ?? TipoCreativo.banner,
      estado: EstadoCreativo.desde(json['estado'] as String?) ?? EstadoCreativo.borrador,
      brief: json['brief'] as String? ?? '',
      creditos: (json['creditos'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] as String? ?? json['created_at'] as String? ?? '',
      variantes: variantesRaw
          .cast<Map<String, dynamic>>()
          .map(VarianteCreativo.fromJson)
          .toList(),
    );
  }
}

/// Respuesta completa de `GET /api/v1/creativos`: saldo de créditos, costo
/// unitario, piezas habilitadas, paquetes comprables y pedidos recientes.
class EstadoCreativos {
  const EstadoCreativos({
    required this.creditos,
    required this.costo,
    required this.textos,
    required this.piezas,
    required this.pedidos,
    required this.paquetes,
  });

  final int creditos;
  final int costo;
  final int textos;
  final List<TipoCreativo> piezas;
  final List<Creativo> pedidos;
  final List<PaqueteCreditos> paquetes;

  factory EstadoCreativos.fromJson(Map<String, dynamic> json) {
    final piezasRaw = json['piezas'] as List? ?? const [];
    final pedidosRaw = json['pedidos'] as List? ?? const [];
    final paquetesRaw = json['paquetes'] as List? ?? const [];
    return EstadoCreativos(
      creditos: (json['creditos'] as num?)?.toInt() ?? 0,
      costo: (json['costo'] as num?)?.toInt() ?? 4,
      textos: (json['textos'] as num?)?.toInt() ?? 4,
      piezas: piezasRaw
          .cast<String>()
          .map(TipoCreativo.desde)
          .whereType<TipoCreativo>()
          .toList(),
      pedidos: pedidosRaw
          .cast<Map<String, dynamic>>()
          .map(Creativo.fromJson)
          .toList(),
      paquetes: paquetesRaw
          .cast<Map<String, dynamic>>()
          .map(PaqueteCreditos.fromJson)
          .toList(),
    );
  }
}

/// Paquete de créditos comprable vía Torre.
class PaqueteCreditos {
  const PaqueteCreditos({
    required this.id,
    required this.creditos,
    required this.usd,
  });

  final String id;
  final int creditos;
  final double usd;

  factory PaqueteCreditos.fromJson(Map<String, dynamic> json) =>
      PaqueteCreditos(
        id: json['id'] as String? ?? '',
        creditos: (json['creditos'] as num?)?.toInt() ?? 0,
        usd: (json['usd'] as num?)?.toDouble() ?? 0,
      );
}

/// Resultado de `POST /api/v1/creativos` (generar un pedido nuevo).
class ResultadoGeneracion {
  const ResultadoGeneracion({
    required this.id,
    required this.formato,
    required this.creditos,
    required this.saldo,
    required this.variantes,
  });

  final String id;
  final TipoCreativo formato;
  final int creditos;
  final int saldo;
  final List<VarianteCreativo> variantes;

  factory ResultadoGeneracion.fromJson(Map<String, dynamic> json) {
    final variantesRaw = json['variantes'] as List? ?? const [];
    return ResultadoGeneracion(
      id: json['id'] as String? ?? '',
      formato: TipoCreativo.desde(json['formato'] as String?) ?? TipoCreativo.banner,
      creditos: (json['creditos'] as num?)?.toInt() ?? 0,
      saldo: (json['saldo'] as num?)?.toInt() ?? 0,
      variantes: variantesRaw
          .cast<Map<String, dynamic>>()
          .map(VarianteCreativo.fromJson)
          .toList(),
    );
  }
}
