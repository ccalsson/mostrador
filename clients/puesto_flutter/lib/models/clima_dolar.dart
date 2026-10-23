/// Modelos para el widget de clima y dólar (paridad con web).
///
/// Los datos se obtienen de APIs públicas sin autenticación:
/// - Dólar: <https://dolarapi.com/v1/dolares/blue>
/// - Clima: <https://api.open-meteo.com/v1/forecast> (Mercado Central)
library;

/// Cotización del dólar y condiciones climáticas del Mercado Central.
class ClimaDolar {
  const ClimaDolar({
    required this.dolarBlueVenta,
    required this.dolarBlueCompra,
    required this.temperatura,
    required this.humedad,
    required this.condicion,
  });

  /// Valor de venta del dólar blue en pesos.
  final double dolarBlueVenta;

  /// Valor de compra del dólar blue en pesos.
  final double dolarBlueCompra;

  /// Temperatura actual en grados Celsius (redondeada).
  final int temperatura;

  /// Humedad relativa en porcentaje (0–100).
  final int humedad;

  /// Descripción textual de la condición climática.
  final String condicion;

  factory ClimaDolar.fromJson({
    required Map<String, dynamic> dolar,
    required Map<String, dynamic> clima,
  }) {
    final current = clima['current'] as Map<String, dynamic>? ?? {};
    return ClimaDolar(
      dolarBlueVenta: (dolar['venta'] as num?)?.toDouble() ?? 0,
      dolarBlueCompra: (dolar['compra'] as num?)?.toDouble() ?? 0,
      temperatura: ((current['temperature_2m'] as num?) ?? 0).round(),
      humedad: ((current['relative_humidity_2m'] as num?) ?? 0).round(),
      condicion: _textoClima((current['weather_code'] as num?)?.toInt() ?? -1),
    );
  }

  /// Mapea códigos WMO a texto legible (igual que la web).
  static String _textoClima(int code) {
    if (code < 0) return 'variable';
    if (code == 0) return 'despejado';
    if (code <= 3) return 'nublado';
    if (code == 45 || code == 48) return 'niebla';
    if (code <= 67) return 'lluvia';
    if (code <= 77) return 'nieve';
    if (code <= 82) return 'chaparrón';
    if (code >= 95) return 'tormenta';
    return 'variable';
  }

  /// Instancia con valores nulos para usar como fallback en errores.
  static const vacio = ClimaDolar(
    dolarBlueVenta: 0,
    dolarBlueCompra: 0,
    temperatura: 0,
    humedad: 0,
    condicion: 'N/A',
  );
}
