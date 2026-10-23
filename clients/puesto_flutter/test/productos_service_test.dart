import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/producto.dart';
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
  group('publicación en Mercado', () {
    for (final publicado in [true, false, null]) {
      test('catálogo interpreta publicadoOnline=$publicado', () {
        final producto = Producto.fromJson({
          'id': 'p_1',
          'nombre': 'Manzana',
          'publicadoOnline': ?publicado,
        });
        expect(producto.publicadoOnline, publicado ?? false);
      });

      test(
        'guardar envía publicadoOnline=$publicado sin perder false',
        () async {
          late http.Request visto;
          final servicio = _servicio(
            MockClient((request) async {
              visto = request;
              return http.Response('{"data":{"id":"p_1"}}', 200);
            }),
          );
          await servicio.guardar(
            ProductoInput(
              id: 'p_1',
              nombre: 'Manzana',
              unidad: 'kg',
              unidadLabel: 'kg',
              precio: 2000,
              stockMinimo: 5,
              alias: [],
              activo: true,
              publicadoOnline: publicado,
            ),
          );
          final body = jsonDecode(visto.body) as Map<String, dynamic>;
          expect(body.containsKey('publicadoOnline'), publicado != null);
          if (publicado != null) expect(body['publicadoOnline'], publicado);
        },
      );
    }
  });

  group('guardar', () {
    test('alta: POST /productos sin id y con stockInicial', () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'id': 'p_nuevo'},
            }),
            201,
          );
        }),
      );

      final id = await servicio.guardar(
        const ProductoInput(
          nombre: 'Banana',
          unidad: 'kg',
          unidadLabel: 'kg',
          precio: 1500,
          stockMinimo: 10,
          alias: ['banana', '🍌'],
          activo: true,
          stockInicial: 25,
        ),
      );

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
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'id': 'p_1'},
            }),
            200,
          );
        }),
      );

      await servicio.guardar(
        const ProductoInput(
          id: 'p_1',
          nombre: 'Manzana',
          unidad: 'kg',
          unidadLabel: 'kg',
          precio: 2000,
          stockMinimo: 5,
          alias: [],
          activo: false,
          stockInicial: 99,
        ),
      );

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
      final servicio = _servicio(
        MockClient(
          (_) async => http.Response(
            jsonEncode({
              'error': 'invalid_request',
              'message': 'unidad inválida',
            }),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );

      await expectLater(
        servicio.guardar(
          const ProductoInput(
            nombre: 'X',
            unidad: 'kg',
            unidadLabel: 'kg',
            precio: 1,
            stockMinimo: 0,
            alias: [],
            activo: true,
          ),
        ),
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
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'ok': true},
            }),
            200,
          );
        }),
      );

      await servicio.bajar('p_1');

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/productos/p_1/baja');
      expect(visto.body, isEmpty);
    });

    test('403 → ForbiddenException', () async {
      final servicio = _servicio(
        MockClient(
          (_) async => http.Response(
            jsonEncode({
              'error': 'forbidden',
              'message': 'No tenés permiso para esta acción.',
            }),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );

      await expectLater(
        servicio.bajar('p_1'),
        throwsA(isA<ForbiddenException>()),
      );
    });
  });

  group('ajustarStock', () {
    test('envía productoId, cantidad con signo, tipo y motivo', () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'ok': true},
            }),
            200,
          );
        }),
      );

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
        MockClient((_) async => http.Response('boom', 500)),
      );

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

  group('subirFoto', () {
    test('POST multipart a /productos/:id/foto devuelve foto_url', () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'foto_url': '/uploads/productos/p_1/1234.jpg'},
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      final url = await servicio.subirFoto(
        productoId: 'p_1',
        bytes: [0xFF, 0xD8, 0xFF, 0xE0], // JPEG magic bytes (truncated)
        nombreArchivo: 'foto.jpg',
        mimeType: 'image/jpeg',
      );

      expect(url, '/uploads/productos/p_1/1234.jpg');
      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/productos/p_1/foto');
      expect(visto.headers['content-type'], contains('multipart/form-data'));
    });

    test('400 → ValidationException', () async {
      final servicio = _servicio(
        MockClient(
          (_) async => http.Response(
            jsonEncode({'message': 'Archivo no válido.'}),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );

      await expectLater(
        servicio.subirFoto(
          productoId: 'p_1',
          bytes: [1, 2, 3],
          nombreArchivo: 'bad.bmp',
          mimeType: 'image/bmp',
        ),
        throwsA(isA<ValidationException>()),
      );
    });
  });

  group('borrarFoto', () {
    test('DELETE /productos/:id/foto', () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({'data': {'ok': true}}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      await servicio.borrarFoto('p_1');

      expect(visto.method, 'DELETE');
      expect(visto.url.path, '/api/v1/productos/p_1/foto');
    });

    test('404 → NotFoundException', () async {
      final servicio = _servicio(
        MockClient(
          (_) async => http.Response(
            jsonEncode({'message': 'Producto no encontrado.'}),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );

      await expectLater(
        servicio.borrarFoto('p_inexistente'),
        throwsA(isA<NotFoundException>()),
      );
    });
  });
}
