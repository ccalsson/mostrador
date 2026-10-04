import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/productos_service.dart';

ProductosAdminService _servicio(MockClient mock) => ProductosAdminService(
      ApiClient(
        baseUrl: 'http://api.test',
        tokenProvider: () async => 'tok-1',
        httpClient: mock,
        timeout: const Duration(seconds: 5),
      ),
    );

void main() {
  group('guardar', () {
    test('alta: POST /productos sin id y con stockInicial', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'id': 'p_nuevo'},
          }),
          201,
        );
      }));

      final id = await servicio.guardar(const ProductoInput(
        nombre: 'Banana',
        unidad: 'kg',
        unidadLabel: 'kg',
        precio: 1500,
        stockMinimo: 10,
        alias: ['banana', '🍌'],
        activo: true,
        stockInicial: 25,
      ));

      expect(id, 'p_nuevo');
      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/productos');
      expect(visto.headers['authorization'], 'Bearer tok-1');
      expect(jsonDecode(visto.body), {
        'nombre': 'Banana',
        'unidad': 'kg',
        'unidadLabel': 'kg',
        'precio': 1500,
        'stockMinimo': 10,
        'alias': ['banana', '🍌'],
        'activo': true,
        'stockInicial': 25,
      });
    });

    test('edición: envía id y omite stockInicial aunque lo tenga', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'id': 'p_1'},
          }),
          200,
        );
      }));

      await servicio.guardar(const ProductoInput(
        id: 'p_1',
        nombre: 'Manzana',
        unidad: 'kg',
        unidadLabel: 'kg',
        precio: 2000,
        stockMinimo: 5,
        alias: [],
        activo: false,
        stockInicial: 99,
      ));

      expect(jsonDecode(visto.body), {
        'id': 'p_1',
        'nombre': 'Manzana',
        'unidad': 'kg',
        'unidadLabel': 'kg',
        'precio': 2000,
        'stockMinimo': 5,
        'alias': <String>[],
        'activo': false,
      });
    });

    test('400 del backend → ValidationException con el mensaje', () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({
              'error': 'invalid_request',
              'message': 'unidad inválida',
            }),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )));

      await expectLater(
        servicio.guardar(const ProductoInput(
          nombre: 'X',
          unidad: 'kg',
          unidadLabel: 'kg',
          precio: 1,
          stockMinimo: 0,
          alias: [],
          activo: true,
        )),
        throwsA(
          isA<ValidationException>().having(
            (e) => e.message,
            'message',
            'unidad inválida',
          ),
        ),
      );
    });
  });

  group('bajar', () {
    test('POST /productos/{id}/baja sin cuerpo', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'ok': true},
          }),
          200,
        );
      }));

      await servicio.bajar('p_1');

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/productos/p_1/baja');
      expect(visto.body, isEmpty);
    });

    test('403 → ForbiddenException', () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({
              'error': 'forbidden',
              'message': 'No tenés permiso para esta acción.',
            }),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )));

      await expectLater(
        servicio.bajar('p_1'),
        throwsA(isA<ForbiddenException>()),
      );
    });
  });

  group('ajustarStock', () {
    test('envía productoId, cantidad con signo, tipo y motivo', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'ok': true},
          }),
          200,
        );
      }));

      await servicio.ajustarStock(
        productoId: 'p_1',
        cantidad: -12.5,
        tipo: 'ajuste',
        motivo: 'recount',
      );

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/stock/ajuste');
      expect(jsonDecode(visto.body), {
        'productoId': 'p_1',
        'cantidad': -12.5,
        'tipo': 'ajuste',
        'motivo': 'recount',
      });
    });

    test('500 → ServerException', () async {
      final servicio = _servicio(
          MockClient((_) async => http.Response('boom', 500)));

      await expectLater(
        servicio.ajustarStock(
          productoId: 'p_1',
          cantidad: 1,
          tipo: 'merma',
          motivo: 'podrido',
        ),
        throwsA(isA<ServerException>()),
      );
    });
  });
}
