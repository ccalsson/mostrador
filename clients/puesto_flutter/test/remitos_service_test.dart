import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/remitos_service.dart';

RemitosService _servicio(MockClient mock) => RemitosService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  test('listar: GET /remitos y parsea la lista', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': [
            {
              'id': 'rem_1',
              'proveedor': 'Distribuidora Norte',
              'fuente': 'pdf',
              'estado': 'procesado',
              'createdAt': '2026-10-01T10:00:00Z',
            }
          ]
        }),
        200,
      );
    }));

    final remitos = await servicio.listar();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/remitos');
    expect(remitos.length, 1);
    expect(remitos[0].id, 'rem_1');
    expect(remitos[0].estado, 'procesado');
  });

  test('obtener: GET /remitos/:id parsea remito y lineas', () async {
    final servicio = _servicio(MockClient((_) async => http.Response(
          jsonEncode({
            'data': {
              'id': 'rem_1',
              'proveedor': 'Prov',
              'fuente': 'manual',
              'estado': 'procesado',
              'createdAt': '2026-10-01',
              'items': [
                {
                  'id': 'rit_1',
                  'descripcionOriginal': 'Manzana x10',
                  'productoId': 'prod_manz',
                  'cantidad': 10,
                  'confianza': 0.95,
                  'confirmado': true,
                }
              ]
            }
          }),
          200,
        )));

    final remito = await servicio.obtener('rem_1');

    expect(remito.items.length, 1);
    expect(remito.items[0].descripcionOriginal, 'Manzana x10');
    expect(remito.items[0].confirmado, true);
    expect(remito.items[0].confianza, 0.95);
  });

  test('actualizarItem: POST /remitos/items', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response('{"data": {"ok": true}}', 200);
    }));

    await servicio.actualizarItem(
      id: 'rit_1',
      productoId: 'prod_1',
      cantidad: 5.5,
      confirmado: true,
    );

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/remitos/items');
    expect(jsonDecode(visto.body), {
      'id': 'rit_1',
      'productoId': 'prod_1',
      'cantidad': 5.5,
      'confirmado': true,
    });
  });

  test('confirmar: POST /remitos/:id/confirmar', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response('{"data": {"ok": true}}', 200);
    }));

    await servicio.confirmar('rem_99');

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/remitos/rem_99/confirmar');
  });
}
