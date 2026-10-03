import 'cobro.dart';

/// Estado del turno de caja abierto (`GET /api/v1/caja`, admin/cajero). Si no
/// había un turno abierto, el backend lo abre al responder; el cliente no
/// calcula ni completa ningún valor: todo viene de la API.
class CajaEstado {
  const CajaEstado({
    required this.id,
    required this.abiertoAt,
    required this.esperado,
    required this.totales,
    required this.ultimos,
  });

  final String id;
  final String abiertoAt;
  final double esperado;
  final List<TotalFormaPago> totales;
  final List<UltimoCobro> ultimos;

  factory CajaEstado.fromJson(Map<String, dynamic> json) {
    return CajaEstado(
      id: json['id'] as String? ?? '',
      abiertoAt: json['abiertoAt'] as String? ?? '',
      esperado: (json['esperado'] as num?)?.toDouble() ?? 0,
      totales: [
        for (final item in (json['totales'] as List? ?? const []))
          TotalFormaPago.fromJson(item as Map<String, dynamic>),
      ],
      ultimos: [
        for (final item in (json['ultimos'] as List? ?? const []))
          UltimoCobro.fromJson(item as Map<String, dynamic>),
      ],
    );
  }
}

/// Resultado del cierre de turno (`POST /api/v1/caja/cerrar`, admin/cajero).
/// Ambos valores los calcula el backend (`esperado` recalculado del turno y
/// `diferencia = real - esperado`); el cliente sólo los muestra.
class CierreCajaResultado {
  const CierreCajaResultado({required this.diferencia, required this.esperado});

  final double diferencia;
  final double esperado;

  factory CierreCajaResultado.fromJson(Map<String, dynamic> json) {
    return CierreCajaResultado(
      diferencia: (json['diferencia'] as num?)?.toDouble() ?? 0,
      esperado: (json['esperado'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// Total cobrado por forma de pago dentro del turno (`totales` del contrato).
class TotalFormaPago {
  const TotalFormaPago({
    required this.formaPagoApi,
    required this.total,
    required this.n,
  });

  final String formaPagoApi;
  final double total;
  final int n;

  /// Cae al valor crudo si el backend agrega una forma de pago que este
  /// cliente todavía no conoce.
  String get formaPagoLabel =>
      FormaPago.fromApi(formaPagoApi)?.label ?? formaPagoApi;

  factory TotalFormaPago.fromJson(Map<String, dynamic> json) {
    return TotalFormaPago(
      formaPagoApi: json['formaPago'] as String? ?? '',
      total: (json['total'] as num?)?.toDouble() ?? 0,
      n: (json['n'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Cobro reciente del turno (`ultimos` del contrato: máx. 12, más nuevos
/// primero). `numero`, `facturaId` y `cae` pueden venir nulos según el estado
/// del cobro; no se derivan localmente.
class UltimoCobro {
  const UltimoCobro({
    required this.id,
    required this.monto,
    required this.formaPagoApi,
    required this.createdAt,
    required this.cliente,
    required this.numero,
    required this.facturaId,
    required this.cae,
  });

  final String id;
  final double monto;
  final String formaPagoApi;
  final String createdAt;
  final String cliente;
  final int? numero;
  final String? facturaId;
  final String? cae;

  String get formaPagoLabel =>
      FormaPago.fromApi(formaPagoApi)?.label ?? formaPagoApi;

  factory UltimoCobro.fromJson(Map<String, dynamic> json) {
    return UltimoCobro(
      id: json['id'] as String? ?? '',
      monto: (json['monto'] as num?)?.toDouble() ?? 0,
      formaPagoApi: json['formaPago'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
      cliente: json['cliente'] as String? ?? '',
      numero: (json['numero'] as num?)?.toInt(),
      facturaId: json['facturaId'] as String?,
      cae: json['cae'] as String?,
    );
  }
}
