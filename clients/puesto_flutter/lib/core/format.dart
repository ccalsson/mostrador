/// Formato de importes y cantidades para la UI (`$1.234,56`).
String moneda(double valor) =>
    '\$${valor.toStringAsFixed(2).replaceAll('.', ',')}';

String cantidadNum(double valor) {
  final redondeado = valor.roundToDouble();
  if (redondeado == valor) return redondeado.toStringAsFixed(0);
  return valor.toStringAsFixed(2).replaceAll('.', ',');
}
