/// Modelos para el widget de clima y dólar.
///
/// La cotización USD→ARS viene del backend propio
/// (`GET /api/v1/cotizacion`), que devuelve el valor **oficial** con el que el
/// ERP convierte los precios cargados en USD a ARS. Es la cifra autoritativa
/// para el puesto: si el header mostrara otra cotización (p. ej. el dólar
/// blue) sería engañoso al lado de precios convertidos al oficial.
///
/// El clima sigue viniendo de una API pública de terceros
/// (<https://api.open-meteo.com/v1/forecast>, Mercado Central) porque no tiene
/// equivalente en el backend y no es información financiera.
library;

/// Cotización oficial del dólar y condiciones climáticas del Mercado Central.
class ClimaDolar {
  const ClimaDolar({
    required this.usdArs,
    required this.temperatura,
    required this.humedad,
    required this.condicion,
  });

  /// Cotización oficial USD→ARS en pesos.
  ///
  /// El backend publica **un único valor** (`usd_ars`): no hay compra/venta
  /// diferenciadas, por eso el modelo tiene un solo campo de dólar en lugar
  /// de los dos que exponía la API externa de dólar blue.
  final double usdArs;

  /// Temperatura actual en grados Celsius (redondeada).
  final int temperatura;

  /// Humedad relativa en porcentaje (0–100).
  final int humedad;

  /// Descripción textual de la condición climática.
  final String condicion;

  /// Arma el modelo desde las dos respuestas crudas ya decodificadas.
  ///
  /// [cotizacion] es el cuerpo de `GET /api/v1/cotizacion`
  /// (`{ "usd_ars": <number> }`, sin envoltorio `data`).
  ///
  /// Lanza [FormatException] si la cotización no trae un número positivo:
  /// mostrar `$0` pareciera un precio real y es peor que no mostrar nada; así
  /// el widget cae en su estado de error ("N/A") con reintento explícito.
  factory ClimaDolar.fromJson({
    required Map<String, dynamic> cotizacion,
    required Map<String, dynamic> clima,
  }) {
    final usdArs = (cotizacion['usd_ars'] as num?)?.toDouble();
    if (usdArs == null || usdArs <= 0) {
      throw const FormatException(
        'La respuesta de /api/v1/cotizacion no trae un usd_ars válido.',
      );
    }
    final current = clima['current'] as Map<String, dynamic>? ?? {};
    return ClimaDolar(
      usdArs: usdArs,
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
    usdArs: 0,
    temperatura: 0,
    humedad: 0,
    condicion: 'N/A',
  );
}
