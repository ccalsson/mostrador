import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/proveedores_service.dart';

ProveedoresService _servicio(MockClient mock) => ProveedoresService(
  ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-1',
    httpClient: mock,
    timeout: const Duration(seconds: 5),
  ),
);

void main() {
  test('listar: GET /proveedores parsea los datos canónicos', () async {
    late http.Request visto;
    final servicio = _servicio(
      MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'prv_1',
                'nombre': 'Distribuidora Norte',
                'cuit': '30-12345678-9',
                'telefono': '1122334455',
                'email': 'ventas@example.test',
                'direccion': 'Calle 1',
                'observaciones': 'Entrega semanal',
                'activo': true,
              },
            ],
          }),
          200,
        );
      }),
    );

    final proveedores = await servicio.listar();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/proveedores');
    expect(proveedores, hasLength(1));
    expect(proveedores.single.nombre, 'Distribuidora Norte');
    expect(proveedores.single.cuit, '30-12345678-9');
    expect(proveedores.single.activo, isTrue);
  });

  test('crear: POST /proveedores con campos de contacto', () async {
    late http.Request visto;
    final servicio = _servicio(
      MockClient((request) async {
        visto = request;
        return http.Response('{"data":{"id":"prv_nuevo"}}', 201);
      }),
    );

    await servicio.crear(
      const ProveedorInput(
        nombre: 'Distribuidora Sur',
        telefono: '1155',
        email: 'sur@example.test',
      ),
    );

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/proveedores');
    expect(jsonDecode(visto.body), {
      'nombre': 'Distribuidora Sur',
      'cuit': null,
      'telefono': '1155',
      'email': 'sur@example.test',
      'direccion': null,
      'observaciones': null,
    });
  });

  test('actualizar: POST /proveedores/:id incluye activo', () async {
    late http.Request visto;
    final servicio = _servicio(
      MockClient((request) async {
        visto = request;
        return http.Response('{"data":{"ok":true}}', 200);
      }),
    );

    await servicio.actualizar(
      'prv_1',
      const ProveedorInput(nombre: 'Distribuidora Norte', activo: false),
    );

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/proveedores/prv_1');
    expect(jsonDecode(visto.body), {
      'nombre': 'Distribuidora Norte',
      'cuit': null,
      'telefono': null,
      'email': null,
      'direccion': null,
      'observaciones': null,
      'activo': false,
    });
  });

  test('productos: GET /proveedores/:id/productos parsea nombres', () async {
    late http.Request visto;
    final servicio = _servicio(
      MockClient((request) async {
        visto = request;
        return http.Response(
          '{"data":{"productos":["Albahaca","Tomate"]}}',
          200,
        );
      }),
    );

    final productos = await servicio.productos('prv_1');

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/proveedores/prv_1/productos');
    expect(productos, ['Albahaca', 'Tomate']);
  });
}
