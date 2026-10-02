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

/// Convierte texto del operador en decimal seguro: acepta `,` o `.` como
/// separador y hasta dos decimales; rechaza agrupadores de miles (`1.500`).
double? parseDecimal(String entrada) {
  final texto = entrada.trim().replaceAll(',', '.');
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(texto)) return null;
  return double.tryParse(texto);
}

/// Redondeo a dos decimales, igual que el backend (`round(v * 100) / 100`).
double redondear2(double valor) => (valor * 100).roundToDouble() / 100;
