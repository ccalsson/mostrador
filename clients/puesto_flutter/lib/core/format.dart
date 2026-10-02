/// Formato de importes y cantidades para la UI (`$1.234,56`).
String moneda(double valor) =>
    '\$${valor.toStringAsFixed(2).replaceAll('.', ',')}';

String cantidadNum(double valor) {
  final redondeado = valor.roundToDouble();
  if (redondeado == valor) return redondeado.toStringAsFixed(0);
  return valor.toStringAsFixed(2).replaceAll('.', ',');
}

/// Las fechas llegan como texto de Postgres (`2026-10-01 18:04:05.123+00`).
String fechaCorta(String valor) =>
    valor.length >= 16 ? valor.substring(0, 16) : valor;
