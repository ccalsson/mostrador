import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/reposicion.dart';
import 'package:puesto_flutter/services/reposicion_service.dart';

ReposicionService _servicio(MockClient mock) => ReposicionService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-test',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('ReposicionResultado.fromJson', () {
    test('parsea correctamente la respuesta del servidor', () {
      final json = {
        'dias': 7,
        'sugerencias': [
          {
            'productoId': 'prod_1',
            'nombre': 'Tomate Redondo',
            'cantidadSugerida': 60.0,
            'stockActual': 10.0,
            'promedioDiario': 10.0,
          },
          {
            'productoId': 'prod_2',
            'nombre': 'Papa Negra',
            'cantidadSugerida': 15.5,
            'stockActual': 4.5,
            'promedioDiario': 3.0,
          },
        ],
      };

      final resultado = ReposicionResultado.fromJson(json);

      expect(resultado.dias, 7);
      expect(resultado.sugerencias.length, 2);
      expect(resultado.sugerencias[0].productoId, 'prod_1');
      expect(resultado.sugerencias[0].nombre, 'Tomate Redondo');
      expect(resultado.sugerencias[0].cantidadSugerida, 60.0);
      expect(resultado.sugerencias[0].stockActual, 10.0);
      expect(resultado.sugerencias[0].promedioDiario, 10.0);
      expect(resultado.sugerencias[1].cantidadSugerida, 15.5);
    });

    test('sugerencias vacías → lista vacía', () {
      final resultado = ReposicionResultado.fromJson({
        'dias': 14,
        'sugerencias': [],
      });
      expect(resultado.dias, 14);
      expect(resultado.sugerencias, isEmpty);
    });

    test('campos faltantes → valores por defecto', () {
      final resultado = ReposicionResultado.fromJson({});
      expect(resultado.dias, 0);
      expect(resultado.sugerencias, isEmpty);
    });
  });

  group('ReposicionSugerencia.esCritico', () {
    test('crítico cuando cantidadSugerida > 2 * promedioDiario', () {
      final sug = ReposicionSugerencia(
        productoId: 'p1',
        nombre: 'Tomate',
        cantidadSugerida: 70,
        stockActual: 0,
        promedioDiario: 10,
      );
      expect(sug.esCritico, isTrue);
    });

    test('no crítico cuando cantidadSugerida <= 2 * promedioDiario', () {
      final sug = ReposicionSugerencia(
        productoId: 'p2',
        nombre: 'Papa',
        cantidadSugerida: 15,
        stockActual: 5,
        promedioDiario: 10,
      );
      expect(sug.esCritico, isFalse);
    });

    test('límite exacto: 2x promedio → no es crítico', () {
      final sug = ReposicionSugerencia(
        productoId: 'p3',
        nombre: 'Cebolla',
        cantidadSugerida: 20,
        stockActual: 0,
        promedioDiario: 10,
      );
      expect(sug.esCritico, isFalse);
    });
  });

  group('ReposicionService', () {
    test('obtener: GET /api/v1/reposicion con query params', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'dias': 14,
              'sugerencias': [
                {
                  'productoId': 'prod_1',
                  'nombre': 'Tomate',
                  'cantidadSugerida': 25.0,
                  'stockActual': 5.0,
                  'promedioDiario': 4.3,
                }
              ],
            }
          }),
          200,
        );
      }));

      final res = await servicio.obtener(dias: 14, stockMinimo: 3);

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/reposicion');
      expect(visto.url.queryParameters['dias'], '14');
      expect(visto.url.queryParameters['stock_minimo'], '3');
      expect(res.dias, 14);
      expect(res.sugerencias.length, 1);
      expect(res.sugerencias.first.nombre, 'Tomate');
    });

    test('obtener: valores por defecto (dias=7, stockMinimo=5)', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'dias': 7, 'sugerencias': []},
          }),
          200,
        );
      }));

      await servicio.obtener();

      expect(visto.url.queryParameters['dias'], '7');
      expect(visto.url.queryParameters['stock_minimo'], '5');
    });

    test('lanza ApiException ante error HTTP', () async {
      final servicio = _servicio(
          MockClient((_) async => http.Response(
                jsonEncode({'error': 'unauthorized'}),
                401,
              )));

      expect(
        () => servicio.obtener(),
        throwsA(isA<ApiException>()),
      );
    });
  });
}
