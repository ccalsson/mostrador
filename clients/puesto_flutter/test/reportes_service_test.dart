import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/reportes_service.dart';

ReportesService _servicio(MockClient mock) => ReportesService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-test',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('ReportesService', () {
    test('obtenerProductos: GET /api/v1/reportes/productos y parsea semana/mes',
        () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'semana': [
                {
                  'productoId': 'prod_1',
                  'nombre': 'Tomate Redondo',
                  'cantidad': 42.5,
                  'total': 85000.0,
                }
              ],
              'mes': [
                {
                  'productoId': 'prod_1',
                  'nombre': 'Tomate Redondo',
                  'cantidad': 180.0,
                  'total': 360000.0,
                },
                {
                  'productoId': 'prod_2',
                  'nombre': 'Papa Negra',
                  'cantidad': 95.0,
                  'total': 190000.0,
                }
              ],
            }
          }),
          200,
        );
      }));

      final res = await servicio.obtenerProductos();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/reportes/productos');
      expect(res.semana.length, 1);
      expect(res.semana.first.nombre, 'Tomate Redondo');
      expect(res.semana.first.cantidad, 42.5);
      expect(res.semana.first.total, 85000.0);
      expect(res.mes.length, 2);
      expect(res.mes[1].nombre, 'Papa Negra');
    });

    test(
        'obtenerHistorialProducto: GET /api/v1/reportes/productos/:id/historial y parsea días',
        () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'dias': [
                {
                  'dia': '2026-10-10',
                  'cantidad': 12.0,
                  'total': 24000.0,
                },
                {
                  'dia': '2026-10-11',
                  'cantidad': 15.5,
                  'total': 31000.0,
                }
              ]
            }
          }),
          200,
        );
      }));

      final res = await servicio.obtenerHistorialProducto('prod_1');

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/reportes/productos/prod_1/historial');
      expect(res.dias.length, 2);
      expect(res.dias[0].dia, '2026-10-10');
      expect(res.dias[0].cantidad, 12.0);
      expect(res.dias[1].total, 31000.0);
    });

    test('obtenerRankingCargadores: GET /api/v1/cargadores/ranking y parsea ranking',
        () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'ranking': [
                {
                  'puesto': 1,
                  'nombre': 'Martín',
                  'nivel': 'Plata',
                  'puntos': 150,
                  'score': 4.9,
                  'recorridosCompletados': 28,
                },
                {
                  'puesto': 2,
                  'nombre': 'Carlos',
                  'nivel': 'Bronce',
                  'puntos': 80,
                  'score': 4.7,
                  'recorridosCompletados': 14,
                }
              ]
            }
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final res = await servicio.obtenerRankingCargadores();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/cargadores/ranking');
      expect(res.ranking.length, 2);
      expect(res.ranking[0].puesto, 1);
      expect(res.ranking[0].nombre, 'Martín');
      expect(res.ranking[0].nivel, 'Plata');
      expect(res.ranking[0].puntos, 150);
      expect(res.ranking[0].score, 4.9);
      expect(res.ranking[0].recorridosCompletados, 28);
    });

    test('lanza ApiException ante error HTTP', () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({'error': 'No autorizado'}),
            401,
          )));

      expect(
        () => servicio.obtenerProductos(),
        throwsA(isA<ApiException>()),
      );
    });
  });
}
