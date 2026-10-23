import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/shell/clima_dolar_widget.dart';
import 'package:puesto_flutter/models/clima_dolar.dart';
import 'package:puesto_flutter/services/clima_dolar_service.dart';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/// Payload real de dolarapi.com para el dólar blue.
Map<String, dynamic> _payloadDolarBlue() => {
      'moneda': 'Dólar',
      'casa': 'blue',
      'nombre': 'Blue',
      'compra': 1200.0,
      'venta': 1250.0,
      'fechaActualizacion': '2026-10-25T10:00:00.000Z',
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

ClimaDolarService _servicio(MockClient mock) =>
    ClimaDolarService(httpClient: mock);

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
    test('fromJson parsea los payloads reales de dolarapi + open-meteo', () {
      final dato = ClimaDolar.fromJson(
        dolar: _payloadDolarBlue(),
        clima: _payloadClima(),
      );
      expect(dato.dolarBlueVenta, 1250.0);
      expect(dato.dolarBlueCompra, 1200.0);
      expect(dato.temperatura, 23); // 22.5 redondeado
      expect(dato.humedad, 65);
      expect(dato.condicion, 'despejado'); // weather_code 0
    });

    test('fromJson tolera payloads vacíos con valores por defecto', () {
      final dato = ClimaDolar.fromJson(
        dolar: const {},
        clima: const {},
      );
      expect(dato.dolarBlueVenta, 0);
      expect(dato.dolarBlueCompra, 0);
      expect(dato.temperatura, 0);
      expect(dato.humedad, 0);
      expect(dato.condicion, 'variable'); // code -1 → variable
    });

    test('mapea códigos WMO a texto correctamente', () {
      // code 1 = nublado parcial (≤ 3)
      final nublado = ClimaDolar.fromJson(
        dolar: _payloadDolarBlue(),
        clima: {
          'current': {'temperature_2m': 18, 'relative_humidity_2m': 80, 'weather_code': 2},
        },
      );
      expect(nublado.condicion, 'nublado');

      // code 61 = lluvia ligera
      final lluvia = ClimaDolar.fromJson(
        dolar: _payloadDolarBlue(),
        clima: {
          'current': {'temperature_2m': 12, 'relative_humidity_2m': 90, 'weather_code': 61},
        },
      );
      expect(lluvia.condicion, 'lluvia');

      // code 95 = tormenta
      final tormenta = ClimaDolar.fromJson(
        dolar: _payloadDolarBlue(),
        clima: {
          'current': {'temperature_2m': 25, 'relative_humidity_2m': 95, 'weather_code': 95},
        },
      );
      expect(tormenta.condicion, 'tormenta');
    });

    test('vacio tiene todos los valores en cero y condición N/A', () {
      expect(ClimaDolar.vacio.dolarBlueVenta, 0);
      expect(ClimaDolar.vacio.dolarBlueCompra, 0);
      expect(ClimaDolar.vacio.temperatura, 0);
      expect(ClimaDolar.vacio.humedad, 0);
      expect(ClimaDolar.vacio.condicion, 'N/A');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests de servicio
  // ---------------------------------------------------------------------------

  group('ClimaDolarService', () {
    test('obtener: GET a dolarapi + open-meteo en paralelo', () async {
      final urls = <String>[];
      final servicio = _servicio(MockClient((request) async {
        urls.add(request.url.toString());
        if (request.url.host == 'dolarapi.com') {
          return http.Response(
            jsonEncode(_payloadDolarBlue()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.host == 'api.open-meteo.com') {
          return http.Response(
            jsonEncode(_payloadClima()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('not found', 404);
      }));

      final dato = await servicio.obtener();

      expect(urls, hasLength(2));
      expect(urls.any((u) => u.contains('dolarapi.com')), isTrue);
      expect(urls.any((u) => u.contains('open-meteo.com')), isTrue);
      expect(dato.dolarBlueVenta, 1250.0);
      expect(dato.temperatura, 23);
    });

    test('obtener: lanza si alguna API responde error', () async {
      final servicio = _servicio(MockClient((request) async {
        if (request.url.host == 'dolarapi.com') {
          return http.Response('error', 500);
        }
        return http.Response(
          jsonEncode(_payloadClima()),
          200,
          headers: {'content-type': 'application/json'},
        );
      }));

      expect(servicio.obtener, throwsA(isA<Exception>()));
    });
  });

  // ---------------------------------------------------------------------------
  // Tests de widget
  // ---------------------------------------------------------------------------

  group('ClimaDolarWidget', () {
    testWidgets('muestra temperatura y dólar blue con datos correctos',
        (tester) async {
      final fake = _FakeService(Future.value(const ClimaDolar(
        dolarBlueVenta: 1250,
        dolarBlueCompra: 1200,
        temperatura: 23,
        humedad: 65,
        condicion: 'despejado',
      )));

      await tester.pumpWidget(_app(servicio: fake, child: const ClimaDolarWidget()));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('clima_temperatura')), findsOneWidget);
      expect(find.text('23°'), findsOneWidget);
      expect(find.byKey(const Key('dolar_blue_venta')), findsOneWidget);
      expect(find.text('\$1250'), findsOneWidget);
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
