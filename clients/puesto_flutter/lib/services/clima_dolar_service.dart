import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../models/clima_dolar.dart';

/// Coordenadas del Mercado Central de Buenos Aires (mismas que la web).
const _mercadoLat = -34.7;
const _mercadoLon = -58.5;

/// URLs de APIs públicas (sin autenticación).
const _urlDolarBlue = 'https://dolarapi.com/v1/dolares/blue';
const _urlClima =
    'https://api.open-meteo.com/v1/forecast'
    '?latitude=$_mercadoLat&longitude=$_mercadoLon'
    '&current=temperature_2m,relative_humidity_2m,weather_code'
    '&timezone=America%2FArgentina%2FBuenos_Aires';

/// Servicio que obtiene la cotización del dólar blue y el clima del Mercado
/// Central combinando dos APIs públicas sin autenticación.
///
/// No usa [ApiClient] porque las APIs externas no requieren Bearer token.
class ClimaDolarService {
  ClimaDolarService({http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final http.Client _http;

  /// Obtiene dólar blue + clima en paralelo. Lanza si alguna falla.
  Future<ClimaDolar> obtener() async {
    final resultados = await Future.wait([
      _http.get(Uri.parse(_urlDolarBlue)),
      _http.get(Uri.parse(_urlClima)),
    ]);

    final dolarRes = resultados[0];
    final climaRes = resultados[1];

    if (dolarRes.statusCode != 200 || climaRes.statusCode != 200) {
      throw Exception('Error al obtener datos: dólar=${dolarRes.statusCode}, clima=${climaRes.statusCode}');
    }

    final dolarJson = jsonDecode(dolarRes.body) as Map<String, dynamic>;
    final climaJson = jsonDecode(climaRes.body) as Map<String, dynamic>;

    return ClimaDolar.fromJson(dolar: dolarJson, clima: climaJson);
  }

  void close() => _http.close();
}

final climaDolarServiceProvider = Provider<ClimaDolarService>((ref) {
  final service = ClimaDolarService();
  ref.onDispose(service.close);
  return service;
});

/// Datos de clima y dólar con cache de 5 minutos y refresco cada 5 minutos.
///
/// No usa reintentos automáticos: si falla, la UI muestra "N/A" y el
/// usuario puede reintentar manualmente.
Duration? _sinReintentos(int retryCount, Object error) => null;

final climaDolarProvider = FutureProvider<ClimaDolar>((ref) {
  ref.keepAlive();
  return ref.watch(climaDolarServiceProvider).obtener();
}, retry: _sinReintentos);
