import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/sucursales_service.dart';

SucursalesService _servicio(
  Future<http.Response> Function(http.Request) handler,
) {
  return SucursalesService(
    ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: MockClient(handler),
    ),
  );
}

void main() {
  test(
    'lee cupo, sucursal actual, cruce semanal y productos de matriz',
    () async {
      final servicio = _servicio((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/api/v1/sucursales');
        expect(request.headers['authorization'], 'Bearer tok-1');
        return http.Response(
          jsonEncode({
            'data': {
              'incluidas': 1,
              'extras': 2,
              'cupo': 3,
              'usadas': 2,
              'puedeCrear': true,
              'esDueno': true,
              'sucursales': [
                {
                  'id': 's_mat',
                  'nombre': 'Matriz',
                  'referencia': '',
                  'esMatriz': true,
                  'activa': true,
                  'esActual': false,
                },
                {
                  'id': 's_norte',
                  'nombre': 'Norte',
                  'referencia': 'Puesto 5',
                  'esMatriz': false,
                  'activa': true,
                  'esActual': true,
                },
              ],
              'cruce': [
                {
                  'id': 's_norte',
                  'nombre': 'Norte',
                  'ventas': 2345.5,
                  'tickets': 4,
                  'stockBajo': 2,
                },
              ],
              'productos': [
                {'id': 'p_matriz', 'nombre': 'Banana', 'stock': 12.5},
              ],
            },
          }),
          200,
        );
      });
      final panel = await servicio.listar();
      expect(panel.cupo, 3);
      expect(panel.usadas, 2);
      expect(panel.puedeCrear, isTrue);
      expect(panel.sucursales.where((s) => s.esActual).single.id, 's_norte');
      expect(panel.sucursales.first.esMatriz, isTrue);
      expect(panel.cruce.single.ventas, 2345.5);
      expect(panel.cruce.single.tickets, 4);
      expect(panel.cruce.single.stockBajo, 2);
      expect(panel.productos.single.id, 'p_matriz');
      expect(panel.productos.single.stock, 12.5);
    },
  );

  test(
    'crea con nombre y referencia, devuelve cantidad de productos copiados',
    () async {
      final servicio = _servicio((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/v1/sucursales');
        expect(jsonDecode(request.body), {
          'nombre': 'Sur',
          'referencia': 'Puesto 12',
        });
        return http.Response('{"data":{"id":"s_sur","productos":8}}', 201);
      });
      final creada = await servicio.crear(
        nombre: 'Sur',
        referencia: 'Puesto 12',
      );
      expect(creada.id, 's_sur');
      expect(creada.productos, 8);
    },
  );

  test('transfiere producto de matriz a la sucursal destino', () async {
    final servicio = _servicio((request) async {
      expect(request.method, 'POST');
      expect(request.url.path, '/api/v1/sucursales/s_sur/transferir');
      expect(jsonDecode(request.body), {
        'productoId': 'p_matriz',
        'cantidad': 3.5,
      });
      return http.Response('{"data":{"ok":true}}', 200);
    });
    await servicio.transferir(
      destinoId: 's_sur',
      productoId: 'p_matriz',
      cantidad: 3.5,
    );
  });

  test('conserva rechazo del servidor por cupo agotado', () async {
    final servicio = _servicio(
      (request) async => http.Response(
        '{"message":"No hay lugar. Torre tiene que habilitar otra sucursal."}',
        400,
      ),
    );
    await expectLater(
      servicio.crear(nombre: 'Sur', referencia: ''),
      throwsA(
        isA<ValidationException>().having(
          (e) => e.message,
          'mensaje',
          'No hay lugar. Torre tiene que habilitar otra sucursal.',
        ),
      ),
    );
  });

  test('no oculta permiso denegado ni inventa transferencia exitosa', () async {
    final servicio = _servicio(
      (request) async => http.Response('{"message":"Sin permiso"}', 403),
    );
    await expectLater(
      servicio.transferir(
        destinoId: 's_sur',
        productoId: 'p_matriz',
        cantidad: 1,
      ),
      throwsA(isA<ForbiddenException>()),
    );
  });

  test('importa clientes desde la sucursal origen y devuelve el conteo',
      () async {
    final servicio = _servicio((request) async {
      expect(request.method, 'POST');
      expect(
        request.url.path,
        '/api/v1/sucursales/s_norte/importar-clientes',
      );
      expect(request.headers['authorization'], 'Bearer tok-1');
      return http.Response('{"data":{"importados":7}}', 200);
    });
    final importados = await servicio.importarClientes('s_norte');
    expect(importados, 7);
  });

  test('rechazo del servidor al importar clientes lanza ApiException',
      () async {
    final servicio = _servicio(
      (request) async =>
          http.Response('{"message":"Sucursal inactiva"}', 400),
    );
    await expectLater(
      servicio.importarClientes('s_inactiva'),
      throwsA(
        isA<ValidationException>().having(
          (e) => e.message,
          'mensaje',
          'Sucursal inactiva',
        ),
      ),
    );
  });
}
