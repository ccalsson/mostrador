/// Movimiento de cuenta corriente de un cliente.
class CuentaMovimiento {
  const CuentaMovimiento({
    required this.id,
    required this.tipo,
    required this.monto,
    this.nota,
    required this.createdAt,
  });

  final String id;
  final String tipo;
  final double monto;
  final String? nota;
  final String createdAt;

  factory CuentaMovimiento.fromJson(Map<String, dynamic> json) {
    return CuentaMovimiento(
      id: json['id'] as String,
      tipo: json['tipo'] as String,
      monto: (json['monto'] as num?)?.toDouble() ?? 0,
      nota: json['nota'] as String?,
      createdAt: json['createdAt'] as String,
    );
  }
}

/// Estado de cuenta corriente de un cliente.
class CuentaCorriente {
  const CuentaCorriente({
    required this.saldo,
    required this.movimientos,
  });

  final double saldo;
  final List<CuentaMovimiento> movimientos;

  factory CuentaCorriente.fromJson(Map<String, dynamic> json) {
    return CuentaCorriente(
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0,
      movimientos: (json['movimientos'] as List?)
              ?.map((e) => CuentaMovimiento.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
