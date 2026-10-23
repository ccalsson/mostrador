import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/escritorio_service.dart';

EscritorioService _servicio(MockClient mock) => EscritorioService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('EscritorioService.obtener', () {
    test('parsea respuesta exitosa', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, '/api/v1/escritorio');
        expect(request.method, 'GET');
        return http.Response(
          jsonEncode({
            'data': {
              'premium': true,
              'margen': {
                'cobrado': 1000,
                'costo': 600,
                'diferencia': 400,
                'sinPrecio': 2,
                'serie': [],
                'entradas': [],
              },
              'deudas': [],
              'cierres': [],
            },
          }),
          200,
        );
      });

      final service = _servicio(mock);
      final resumen = await service.obtener();

      expect(resumen.premium, true);
      expect(resumen.margen.cobrado, 1000);
      expect(resumen.margen.costo, 600);
      expect(resumen.margen.diferencia, 400);
      expect(resumen.margen.sinPrecio, 2);
    });

    test('parsea respuesta sin premium', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'data': {
              'premium': false,
              'margen': {
                'cobrado': 0,
                'costo': 0,
                'diferencia': 0,
                'sinPrecio': 0,
                'serie': [],
                'entradas': [],
              },
              'deudas': [],
              'cierres': [],
            },
          }),
          200,
        );
      });

      final service = _servicio(mock);
      final resumen = await service.obtener();

      expect(resumen.premium, false);
    });

    test('parsea deudas y cierres', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'data': {
              'premium': true,
              'margen': {
                'cobrado': 0,
                'costo': 0,
                'diferencia': 0,
                'sinPrecio': 0,
                'serie': [],
                'entradas': [],
              },
              'deudas': [
                {'id': 'cli_1', 'nombre': 'Juan', 'saldo': 500},
                {'id': 'cli_2', 'nombre': 'Maria', 'saldo': 300},
              ],
              'cierres': [
                {
                  'id': 'cje_1',
                  'cerradoAt': '2026-10-23T10:00:00Z',
                  'esperado': 1000,
                  'real': 950,
                  'diferencia': -50,
                  'notas': 'Faltante',
                  'quien': 'Admin',
                },
              ],
            },
          }),
          200,
        );
      });

      final service = _servicio(mock);
      final resumen = await service.obtener();

      expect(resumen.deudas.length, 2);
      expect(resumen.deudas[0].nombre, 'Juan');
      expect(resumen.deudas[0].saldo, 500);
      expect(resumen.cierres.length, 1);
      expect(resumen.cierres[0].diferencia, -50);
    });
  });
}
