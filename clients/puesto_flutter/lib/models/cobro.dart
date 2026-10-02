/// Forma de pago según el contrato v1 (`POST /api/v1/pedidos/:id/cobrar`).
enum FormaPago {
  efectivo('efectivo', 'Efectivo'),
  transferencia('transferencia', 'Transferencia'),
  tarjeta('tarjeta', 'Tarjeta'),
  cuentaCorriente('cuenta_corriente', 'Cuenta corriente');

  const FormaPago(this.apiValue, this.label);

  final String apiValue;
  final String label;

  /// Sólo efectivo admite importe recibido y exige que cubra el total.
  bool get admiteRecibido => this == FormaPago.efectivo;

  static FormaPago? fromApi(String value) {
    for (final forma in FormaPago.values) {
      if (forma.apiValue == value) return forma;
    }
    return null;
  }
}

/// Resultado de `POST /api/v1/pedidos/:id/cobrar`. El backend lo devuelve tal
/// cual, incluso al reintentar con el mismo `clientUuid`.
class CobroResultado {
  const CobroResultado({
    required this.cobroId,
    required this.ticketId,
    required this.numero,
    required this.vuelto,
    required this.total,
  });

  final String cobroId;
  final String? ticketId;
  final int numero;
  final double vuelto;
  final double total;

  factory CobroResultado.fromJson(Map<String, dynamic> json) {
    return CobroResultado(
      cobroId: json['cobroId'] as String,
      ticketId: json['ticketId'] as String?,
      numero: (json['numero'] as num?)?.toInt() ?? 0,
      vuelto: (json['vuelto'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
    );
  }
}
