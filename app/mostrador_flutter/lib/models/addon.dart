/// Modelos para add-ons y contratos legales.
///
/// Paridad con los endpoints /api/v1/addons/* del backend.
library;

/// Un add-on disponible para comprar.
class Addon {
  const Addon({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.precioUSD,
    required this.precioARS,
    this.icono,
    this.contratado = false,
  });

  factory Addon.fromJson(Map<String, dynamic> j) => Addon(
        id: j['id'] as String,
        nombre: j['nombre'] as String? ?? '',
        descripcion: j['descripcion'] as String? ?? '',
        precioUSD: _num(j['precioUSD']),
        precioARS: _num(j['precioARS']),
        icono: j['icono'] as String?,
        contratado: j['contratado'] as bool? ?? false,
      );

  final String id;
  final String nombre;
  final String descripcion;
  final double precioUSD;
  final double precioARS;
  final String? icono;
  final bool contratado;

  Map<String, dynamic> toJson() => {
        'id': id,
        'nombre': nombre,
        'descripcion': descripcion,
        'precioUSD': precioUSD,
        'precioARS': precioARS,
        if (icono != null) 'icono': icono,
        'contratado': contratado,
      };
}

/// Documento legal que el usuario debe aceptar antes de comprar.
class AddonContrato {
  const AddonContrato({
    required this.id,
    required this.titulo,
    required this.version,
    required this.hash,
    this.aceptado = false,
  });

  factory AddonContrato.fromJson(Map<String, dynamic> j) => AddonContrato(
        id: j['id'] as String? ?? j['documentoId'] as String? ?? '',
        titulo: j['titulo'] as String? ?? '',
        version: (j['version'] as num?)?.toInt() ?? 0,
        hash: j['hash'] as String? ?? '',
        aceptado: j['aceptado'] as bool? ?? false,
      );

  final String id;
  final String titulo;
  final int version;
  final String hash;
  final bool aceptado;
}

/// Resultado de comprar un add-on.
class AddonCompraResultado {
  const AddonCompraResultado({
    required this.ok,
    this.mensaje = '',
  });

  factory AddonCompraResultado.fromJson(Map<String, dynamic> j) =>
      AddonCompraResultado(
        ok: j['ok'] as bool? ?? true,
        mensaje: j['mensaje'] as String? ?? '',
      );

  final bool ok;
  final String mensaje;
}

/// Excepcion cuando la compra falla (saldo insuficiente, ya contratado, etc.).
class AddonCompraException implements Exception {
  const AddonCompraException(this.statusCode, this.mensaje);
  final int statusCode;
  final String mensaje;

  /// Mensaje amigable para el usuario.
  String get mensajeUsuario {
    if (statusCode == 402 || mensaje.contains('saldo')) {
      return 'No tenés saldo suficiente en cuenta corriente.';
    }
    if (statusCode == 409 || mensaje.contains('contratado')) {
      return 'Este add-on ya está contratado.';
    }
    if (statusCode == 400) {
      return mensaje.isNotEmpty ? mensaje : 'Datos inválidos para la compra.';
    }
    return 'Error al comprar el add-on. Intentá de nuevo.';
  }

  @override
  String toString() => 'AddonCompraException($statusCode): $mensaje';
}

/// Excepción genérica de la API de add-ons.
class AddonsApiException implements Exception {
  const AddonsApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  String toString() => 'AddonsApiException($statusCode)';
}

double _num(Object? value) {
  if (value == null) return 0;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString()) ?? 0;
}
