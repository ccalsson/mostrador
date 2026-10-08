// Contrato de suscripción y legal (Parte A) según
// `app/docs/suscripcion-legal-propuesta.md`. Torre es la única fuente de
// verdad: la app muestra códigos, planes y estados tal como llegan y nunca
// decide vigencias, precios ni versiones.

class PlanSuscripcion {
  const PlanSuscripcion({required this.codigo, required this.nombre});

  final String codigo;
  final String nombre;

  factory PlanSuscripcion.fromJson(Map<String, dynamic> json) =>
      PlanSuscripcion(
        codigo: json['codigo'] as String,
        nombre: json['nombre'] as String,
      );
}

class AddOnSuscripcion {
  const AddOnSuscripcion({
    required this.codigo,
    required this.nombre,
    required this.activo,
    this.detalle,
  });

  final String codigo;
  final String nombre;
  final bool activo;
  final String? detalle;

  factory AddOnSuscripcion.fromJson(Map<String, dynamic> json) =>
      AddOnSuscripcion(
        codigo: json['codigo'] as String,
        nombre: json['nombre'] as String,
        activo: json['activo'] as bool? ?? false,
        detalle: json['detalle'] as String?,
      );
}

class PrecioVigente {
  const PrecioVigente({
    required this.moneda,
    required this.monto,
    required this.periodo,
  });

  final String moneda;
  final num monto;
  final String periodo;

  factory PrecioVigente.fromJson(Map<String, dynamic> json) => PrecioVigente(
        moneda: json['moneda'] as String,
        monto: json['monto'] as num,
        periodo: json['periodo'] as String,
      );
}

class CondicionesComerciales {
  const CondicionesComerciales({required this.resumen, this.actualizado});

  final String resumen;
  final String? actualizado;

  factory CondicionesComerciales.fromJson(Map<String, dynamic> json) =>
      CondicionesComerciales(
        resumen: json['resumen'] as String,
        actualizado: json['actualizado'] as String?,
      );
}

/// Referencia al contrato vigente dentro del resumen (A.1).
class ContratoReferencia {
  const ContratoReferencia({
    required this.documentoId,
    required this.version,
    required this.hash,
    required this.estado,
    required this.aceptadoPorMi,
    this.fechaAceptacion,
  });

  final String documentoId;
  final int version;
  final String hash;
  final String estado;
  final bool aceptadoPorMi;
  final String? fechaAceptacion;

  factory ContratoReferencia.fromJson(Map<String, dynamic> json) =>
      ContratoReferencia(
        documentoId: json['documentoId'] as String,
        version: json['version'] as int,
        hash: json['hash'] as String,
        estado: json['estado'] as String,
        aceptadoPorMi: json['aceptadoPorMi'] as bool? ?? false,
        fechaAceptacion: json['fechaAceptacion'] as String?,
      );
}

/// Versión pendiente de aceptación que anuncia A.1. El aceptar (A.4) envía
/// exactamente documentoId + version + hash que el backend entregó.
class PendienteAceptacion {
  const PendienteAceptacion({
    required this.hayPendiente,
    this.documentoId,
    this.version,
    this.hash,
  });

  final bool hayPendiente;
  final String? documentoId;
  final int? version;
  final String? hash;

  /// Puede aceptarse sólo si el backend entregó los tres datos que exige A.4.
  bool get aceptable =>
      hayPendiente && documentoId != null && version != null && hash != null;

  factory PendienteAceptacion.fromJson(Map<String, dynamic> json) =>
      PendienteAceptacion(
        hayPendiente: json['hayPendiente'] as bool? ?? false,
        documentoId: json['documentoId'] as String?,
        version: json['version'] as int?,
        hash: json['hash'] as String?,
      );
}

class SuscripcionResumen {
  const SuscripcionResumen({
    required this.plan,
    required this.estado,
    this.inicio,
    this.proximaRenovacion,
    required this.addons,
    this.sucursalesContratadas,
    this.mercadoAlToqueContratado,
    this.precioVigente,
    this.condicionesComerciales,
    this.contratoVigente,
    required this.pendiente,
  });

  final PlanSuscripcion plan;
  final String estado;
  final String? inicio;
  final String? proximaRenovacion;
  final List<AddOnSuscripcion> addons;
  final int? sucursalesContratadas;
  final bool? mercadoAlToqueContratado;
  final PrecioVigente? precioVigente;
  final CondicionesComerciales? condicionesComerciales;
  final ContratoReferencia? contratoVigente;
  final PendienteAceptacion pendiente;

  /// A.1 anida plan/estado/fechas bajo `suscripcion`; el resto va al tope
  /// de `data`.
  factory SuscripcionResumen.fromJson(Map<String, dynamic> json) {
    final suscripcion =
        (json['suscripcion'] as Map? ?? const {}).cast<String, dynamic>();
    return SuscripcionResumen(
      plan: PlanSuscripcion.fromJson(
          (suscripcion['plan'] as Map).cast<String, dynamic>()),
      estado: suscripcion['estado'] as String,
      inicio: suscripcion['inicio'] as String?,
      proximaRenovacion: suscripcion['proximaRenovacion'] as String?,
      addons: _lista(json['addons'], AddOnSuscripcion.fromJson),
      sucursalesContratadas: json['sucursalesContratadas'] as int?,
      mercadoAlToqueContratado: json['mercadoAlToqueContratado'] as bool?,
      precioVigente: json['precioVigente'] == null
          ? null
          : PrecioVigente.fromJson(
              (json['precioVigente'] as Map).cast<String, dynamic>()),
      condicionesComerciales: json['condicionesComerciales'] == null
          ? null
          : CondicionesComerciales.fromJson(
              (json['condicionesComerciales'] as Map).cast<String, dynamic>()),
      contratoVigente: json['contratoVigente'] == null
          ? null
          : ContratoReferencia.fromJson(
              (json['contratoVigente'] as Map).cast<String, dynamic>()),
      pendiente: json['pendiente'] == null
          ? const PendienteAceptacion(hayPendiente: false)
          : PendienteAceptacion.fromJson(
              (json['pendiente'] as Map).cast<String, dynamic>()),
    );
  }
}

/// `contenido` de A.2: la app renderiza según el formato que anuncia el
/// backend (texto/html se muestran, pdf_url se muestra como enlace).
class ContenidoDocumento {
  const ContenidoDocumento({required this.formato, required this.valor});

  final String formato;
  final String valor;

  bool get esPdfUrl => formato == 'pdf_url';

  factory ContenidoDocumento.fromJson(Map<String, dynamic> json) =>
      ContenidoDocumento(
        formato: json['formato'] as String,
        valor: json['valor'] as String,
      );
}

class AnexoContrato {
  const AnexoContrato({
    required this.documentoId,
    required this.titulo,
    required this.version,
    required this.hash,
    required this.contenido,
  });

  final String documentoId;
  final String titulo;
  final int version;
  final String hash;
  final ContenidoDocumento contenido;

  factory AnexoContrato.fromJson(Map<String, dynamic> json) => AnexoContrato(
        documentoId: json['documentoId'] as String,
        titulo: json['titulo'] as String,
        version: json['version'] as int,
        hash: json['hash'] as String,
        contenido: ContenidoDocumento.fromJson(
            (json['contenido'] as Map).cast<String, dynamic>()),
      );
}

/// Documento completo devuelto por A.2 (`GET /suscripcion/contrato`).
class ContratoDocumento {
  const ContratoDocumento({
    required this.documentoId,
    required this.version,
    required this.hash,
    required this.estado,
    required this.titulo,
    this.fechaVigencia,
    required this.contenido,
    required this.anexos,
  });

  final String documentoId;
  final int version;
  final String hash;
  final String estado;
  final String titulo;
  final String? fechaVigencia;
  final ContenidoDocumento contenido;
  final List<AnexoContrato> anexos;

  factory ContratoDocumento.fromJson(Map<String, dynamic> json) =>
      ContratoDocumento(
        documentoId: json['documentoId'] as String,
        version: json['version'] as int,
        hash: json['hash'] as String,
        estado: json['estado'] as String,
        titulo: json['titulo'] as String,
        fechaVigencia: json['fechaVigencia'] as String?,
        contenido: ContenidoDocumento.fromJson(
            (json['contenido'] as Map).cast<String, dynamic>()),
        anexos: _lista(json['anexos'], AnexoContrato.fromJson),
      );
}

class AceptacionHistorial {
  const AceptacionHistorial({required this.fecha, this.aceptadoPor});

  final String fecha;
  final String? aceptadoPor;

  factory AceptacionHistorial.fromJson(Map<String, dynamic> json) =>
      AceptacionHistorial(
        fecha: json['fecha'] as String,
        aceptadoPor: json['aceptadoPor'] as String?,
      );
}

/// Entrada del historial inmutable (A.3).
class EntradaHistorial {
  const EntradaHistorial({
    required this.documentoId,
    required this.version,
    required this.hash,
    required this.tipo,
    required this.estado,
    required this.fechaDesde,
    this.fechaHasta,
    this.aceptacion,
  });

  final String documentoId;
  final int version;
  final String hash;
  final String tipo;
  final String estado;
  final String fechaDesde;
  final String? fechaHasta;
  final AceptacionHistorial? aceptacion;

  factory EntradaHistorial.fromJson(Map<String, dynamic> json) =>
      EntradaHistorial(
        documentoId: json['documentoId'] as String,
        version: json['version'] as int,
        hash: json['hash'] as String,
        tipo: json['tipo'] as String,
        estado: json['estado'] as String,
        fechaDesde: json['fechaDesde'] as String,
        fechaHasta: json['fechaHasta'] as String?,
        aceptacion: json['aceptacion'] == null
            ? null
            : AceptacionHistorial.fromJson(
                (json['aceptacion'] as Map).cast<String, dynamic>()),
      );
}

List<T> _lista<T>(dynamic valor, T Function(Map<String, dynamic>) desde) =>
    (valor as List? ?? const [])
        .whereType<Map>()
        .map((e) => desde(e.cast<String, dynamic>()))
        .toList();
