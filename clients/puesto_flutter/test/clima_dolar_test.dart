import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/shell/clima_dolar_widget.dart';
import 'package:puesto_flutter/models/clima_dolar.dart';
import 'package:puesto_flutter/services/clima_dolar_service.dart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/// Payload real de `GET /api/v1/cotizacion`: un solo valor, sin envoltorio
/// `data`. Es el dólar oficial con el que el ERP convierte precios USD → ARS.
Map<String, dynamic> _payloadCotizacion({double? usdArs}) => {
      'usd_ars': ?usdArs,
    };

/// Payload real de open-meteo.com para el clima del Mercado Central.
Map<String, dynamic> _payloadClima() => {
      'latitude': -34.7,
      'longitude': -58.5,
      'current_units': {
        'temperature_2m': '°C',
        'relative_humidity_2m': '%',
        'weather_code': 'wmo code',
      },
      'current': {
        'time': '2026-10-25T10:00',
        'interval': 900,
        'temperature_2m': 22.5,
        'relative_humidity_2m': 65,
        'weather_code': 0,
      },
    };

ApiClient _api(MockClient mock) => ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    );

/// La cotización sale del backend ([api]); el clima, de un tercero ([clima]).
ClimaDolarService _servicio({
  required MockClient api,
  required MockClient clima,
}) =>
    ClimaDolarService(apiClient: _api(api), httpClient: clima);

MockClient _apiMock(Map<String, dynamic> cotizacion, {int status = 200}) =>
    MockClient((request) async {
      if (request.url.path != '/api/v1/cotizacion') {
        return http.Response('not found', 404);
      }
      return http.Response(
        jsonEncode(cotizacion),
        status,
        headers: {'content-type': 'application/json'},
      );
    });

MockClient _climaMock({int status = 200, Map<String, dynamic>? cuerpo}) =>
    MockClient((request) async {
      if (request.url.host != 'api.open-meteo.com') {
        return http.Response('not found', 404);
      }
      return http.Response(
        jsonEncode(cuerpo ?? _payloadClima()),
        status,
        headers: {'content-type': 'application/json'},
      );
    });

Widget _app({
  required ClimaDolarService servicio,
  required Widget child,
}) {
  return ProviderScope(
    overrides: [climaDolarServiceProvider.overrideWithValue(servicio)],
    child: MaterialApp(
      theme: temaClaro(),
      home: Scaffold(body: child),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests de modelo
// ---------------------------------------------------------------------------

void main() {
  group('ClimaDolar model', () {
    test('fromJson parsea la cotización del backend y el clima', () {
      final dato = ClimaDolar.fromJson(
        cotizacion: _payloadCotizacion(usdArs: 1480.0),
        clima: _payloadClima(),
      );
      expect(dato.usdArs, 1480.0);
      expect(dato.temperatura, 23); // 22.5 redondeado
      expect(dato.humedad, 65);
      expect(dato.condicion, 'despejado'); // weather_code 0
    });

    test('fromJson lanza si la cotización no trae usd_ars', () {
      expect(
        () => ClimaDolar.fromJson(cotizacion: const {}, clima: _payloadClima()),
        throwsA(isA<FormatException>()),
      );
    });

    test('fromJson lanza si usd_ars no es positivo', () {
      // Mostrar `$0` parecería un precio real: es peor que no mostrar nada.
      for (final valor in [0.0, -1.0]) {
        expect(
          () => ClimaDolar.fromJson(
            cotizacion: _payloadCotizacion(usdArs: valor),
            clima: _payloadClima(),
          ),
          throwsA(isA<FormatException>()),
        );
      }
    });

    test('clima vacío degrada a ceros sin arrastrar la cotización', () {
      final dato = ClimaDolar.fromJson(
        cotizacion: _payloadCotizacion(usdArs: 1480.0),
        clima: const {},
      );
      expect(dato.usdArs, 1480.0);
      expect(dato.temperatura, 0);
      expect(dato.humedad, 0);
      expect(dato.condicion, 'variable'); // code -1 → variable
    });

    test('mapea códigos WMO a texto correctamente', () {
      Map<String, dynamic> climaCon(int code) => {
            'current': {
              'temperature_2m': 18,
              'relative_humidity_2m': 80,
              'weather_code': code,
            },
          };
      final cot = _payloadCotizacion(usdArs: 1480.0);

      // code 2 = nublado parcial (≤ 3)
      expect(
        ClimaDolar.fromJson(cotizacion: cot, clima: climaCon(2)).condicion,
        'nublado',
      );
      // code 61 = lluvia ligera
      expect(
        ClimaDolar.fromJson(cotizacion: cot, clima: climaCon(61)).condicion,
        'lluvia',
      );
      // code 95 = tormenta
      expect(
        ClimaDolar.fromJson(cotizacion: cot, clima: climaCon(95)).condicion,
        'tormenta',
      );
    });

    test('vacio tiene todos los valores en cero y condición N/A', () {
      expect(ClimaDolar.vacio.usdArs, 0);
      expect(ClimaDolar.vacio.temperatura, 0);
      expect(ClimaDolar.vacio.humedad, 0);
      expect(ClimaDolar.vacio.condicion, 'N/A');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests de servicio
  // ---------------------------------------------------------------------------

  group('ClimaDolarService', () {
    test('obtener: pide la cotización al backend y el clima a open-meteo',
        () async {
      final urls = <String>[];
      final servicio = ClimaDolarService(
        apiClient: _api(MockClient((request) async {
          urls.add(request.url.toString());
          return http.Response(
            jsonEncode(_payloadCotizacion(usdArs: 1480.0)),
            200,
            headers: {'content-type': 'application/json'},
          );
        })),
        httpClient: MockClient((request) async {
          urls.add(request.url.toString());
          return http.Response(
            jsonEncode(_payloadClima()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final dato = await servicio.obtener();

      expect(urls, hasLength(2));
      expect(urls.any((u) => u.endsWith('/api/v1/cotizacion')), isTrue);
      expect(urls.any((u) => u.contains('open-meteo.com')), isTrue);
      // Ninguna llamada debe salir a dólar blue: la tasa del header es la del ERP.
      expect(urls.any((u) => u.contains('dolarapi.com')), isFalse);
      expect(dato.usdArs, 1480.0);
      expect(dato.temperatura, 23);
    });

    test('obtener: manda el token Bearer a la cotización', () async {
      String? autorizacion;
      final servicio = ClimaDolarService(
        apiClient: _api(MockClient((request) async {
          autorizacion = request.headers['authorization'];
          return http.Response(
            jsonEncode(_payloadCotizacion(usdArs: 1480.0)),
            200,
            headers: {'content-type': 'application/json'},
          );
        })),
        httpClient: _climaMock(),
      );

      await servicio.obtener();

      expect(autorizacion, 'Bearer tok-1');
    });

    test('obtener: lanza si el clima responde error', () async {
      final servicio = _servicio(
        api: _apiMock(_payloadCotizacion(usdArs: 1480.0)),
        clima: _climaMock(status: 500, cuerpo: const {}),
      );

      expect(servicio.obtener, throwsA(isA<Exception>()));
    });

    test('obtener: lanza si el backend no trae una cotización válida', () async {
      final servicio = _servicio(api: _apiMock(const {}), clima: _climaMock());

      expect(servicio.obtener, throwsA(isA<FormatException>()));
    });

    test('obtener: propaga el error del backend', () async {
      final servicio = _servicio(
        api: _apiMock(const {}, status: 500),
        clima: _climaMock(),
      );

      expect(servicio.obtener, throwsA(isA<Exception>()));
    });
  });

  // ---------------------------------------------------------------------------
  // Tests de widget
  // ---------------------------------------------------------------------------

  group('ClimaDolarWidget', () {
    testWidgets('muestra temperatura y dólar oficial con datos correctos',
        (tester) async {
      final fake = _FakeService(Future.value(const ClimaDolar(
        usdArs: 1480,
        temperatura: 23,
        humedad: 65,
        condicion: 'despejado',
      )));

      await tester.pumpWidget(_app(servicio: fake, child: const ClimaDolarWidget()));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('clima_temperatura')), findsOneWidget);
      expect(find.text('23°'), findsOneWidget);
      expect(find.byKey(const Key('dolar_oficial')), findsOneWidget);
      expect(find.text('\$1480'), findsOneWidget);
      expect(find.byKey(const Key('dolar_oficial_label')), findsOneWidget);
    });

    testWidgets('muestra N/A cuando falla la carga', (tester) async {
      final fake = _FakeServiceError(Exception('sin conexión'));

      await tester.pumpWidget(_app(servicio: fake, child: const ClimaDolarWidget()));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('clima_dolar_na')), findsOneWidget);
      expect(find.text('N/A'), findsOneWidget);
    });

    testWidgets('el botón refresh invalida el provider', (tester) async {
      var llamadas = 0;
      final fake = _FakeServiceConContador(() {
        llamadas++;
        return Future.value(ClimaDolar.vacio);
      });

      await tester.pumpWidget(_app(servicio: fake, child: const ClimaDolarWidget()));
      await tester.pumpAndSettle();

      expect(llamadas, 1);

      await tester.tap(find.byKey(const Key('clima_dolar_refresh')));
      await tester.pumpAndSettle();

      expect(llamadas, 2);
    });
  });
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _FakeService implements ClimaDolarService {
  _FakeService(this._future);
  final Future<ClimaDolar> _future;

  @override
  Future<ClimaDolar> obtener() async => _future;

  @override
  void close() {}
}

class _FakeServiceError implements ClimaDolarService {
  _FakeServiceError(this._error);
  final Object _error;

  @override
  Future<ClimaDolar> obtener() async => throw _error;

  @override
  void close() {}
}

class _FakeServiceConContador implements ClimaDolarService {
  _FakeServiceConContador(this._factory);
  final Future<ClimaDolar> Function() _factory;

  @override
  Future<ClimaDolar> obtener() => _factory();

  @override
  void close() {}
}
