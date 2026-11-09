import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../core/network/api_client.dart';
import '../models/clima_dolar.dart';

/// Coordenadas del Mercado Central de Buenos Aires (mismas que la web).
const _mercadoLat = -34.7;
const _mercadoLon = -58.5;

/// Cotización USD→ARS **oficial** que usa el ERP para convertir los precios
/// cargados en dólares. Respuesta: `{ "usd_ars": <number> }` (sin envoltorio
/// `data`). Requiere `Authorization: Bearer` (audience default `staff`).
const _rutaCotizacion = '/api/v1/cotizacion';

/// URL pública del clima: único dato realmente externo, sin equivalente en el
/// backend y sin información financiera.
const _urlClima =
    'https://api.open-meteo.com/v1/forecast'
    '?latitude=$_mercadoLat&longitude=$_mercadoLon'
    '&current=temperature_2m,relative_humidity_2m,weather_code'
    '&timezone=America%2FArgentina%2FBuenos_Aires';

/// Servicio que combina la cotización oficial del dólar provista por el
/// backend (`GET /api/v1/cotizacion`) con el clima del Mercado Central.
///
/// La parte financiera pasa por [ApiClient] — token Bearer, timeouts, ETag y
/// mapeo de errores— tal como el resto de los servicios de la app. Sólo el
/// clima se sigue pidiendo directo a un tercero, así que el servicio conserva
/// su propio cliente `http` para esa llamada.
class ClimaDolarService {
  ClimaDolarService({
    required ApiClient apiClient,
    http.Client? httpClient,
  })  : _api = apiClient,
        _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  /// Obtiene dólar oficial + clima en paralelo. Lanza si alguno falla.
  Future<ClimaDolar> obtener() async {
    final resultados = await Future.wait(<Future<Object>>[
      _obtenerCotizacion(),
      _obtenerClima(),
    ]);

    return ClimaDolar.fromJson(
      cotizacion: resultados[0] as Map<String, dynamic>,
      clima: resultados[1] as Map<String, dynamic>,
    );
  }

  /// Cotización oficial del backend. Es la cifra autoritativa del ERP: el
  /// catálogo puede tener precios en USD y los cobros en ARS, así que mostrar
  /// otra cotización (p. ej. el dólar blue) engañaría al personal.
  Future<Map<String, dynamic>> _obtenerCotizacion() async {
    final data = await _api.get(_rutaCotizacion);
    if (data is! Map<String, dynamic>) {
      throw const FormatException(
        'Respuesta inválida de $_rutaCotizacion.',
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> _obtenerClima() async {
    final res = await _http.get(Uri.parse(_urlClima));
    if (res.statusCode != 200) {
      throw Exception('Error al obtener el clima: estado ${res.statusCode}');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Respuesta inválida del servicio de clima.');
    }
    return decoded;
  }

  /// Cierra sólo el cliente HTTP del clima: el [ApiClient] del backend es
  /// propiedad de [apiClientProvider] y lo disposer Riverpod.
  void close() => _http.close();
}

final climaDolarServiceProvider = Provider<ClimaDolarService>((ref) {
  final service = ClimaDolarService(
    apiClient: ref.watch(apiClientProvider),
  );
  ref.onDispose(service.close);
  return service;
});

/// Datos de clima y dólar oficial con cache de 5 minutos y refresco cada 5
/// minutos.
///
/// No usa reintentos automáticos: si falla, la UI muestra "N/A" y el
/// usuario puede reintentar manualmente.
Duration? _sinReintentos(int retryCount, Object error) => null;

final climaDolarProvider = FutureProvider<ClimaDolar>((ref) {
  ref.keepAlive();
  return ref.watch(climaDolarServiceProvider).obtener();
}, retry: _sinReintentos);
