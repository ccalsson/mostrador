import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/marca.dart';
import 'package:puesto_flutter/services/marca_service.dart';

MarcaService _servicio(MockClient mock) => MarcaService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-admin',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

const _marcaCompleta = {
  'nombre': 'La Esquina',
  'bajada': 'Almacén de barrio',
  'membrete': 'La Esquina - Av. Siempre Viva 123',
  'pie': 'Gracias por su compra',
  'fondo': '#0F3D26',
};

void main() {
  test('obtener: GET /api/v1/marca y parseo completo', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(jsonEncode(_marcaCompleta), 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }));

    final marca = await servicio.obtener();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/marca');
    expect(visto.headers['authorization'], 'Bearer tok-admin');
    expect(marca.nombre, 'La Esquina');
    expect(marca.bajada, 'Almacén de barrio');
    expect(marca.membrete, 'La Esquina - Av. Siempre Viva 123');
    expect(marca.pie, 'Gracias por su compra');
    expect(marca.fondo, '#0F3D26');
  });

  test('obtener: tolera campos ausentes (null → vacío)', () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'nombre': 'SoloNombre'}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final marca = await servicio.obtener();

    expect(marca.nombre, 'SoloNombre');
    expect(marca.bajada, '');
    expect(marca.membrete, '');
    expect(marca.pie, '');
    expect(marca.fondo, '');
  });

  test('guardar: POST /api/v1/marca con los cinco campos', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response('{}', 200,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }));

    final marca = const Marca(
      nombre: 'La Esquina',
      bajada: 'Almacén',
      membrete: 'Membrete',
      pie: 'Pie',
      fondo: '#FFF',
    );
    await servicio.guardar(marca);

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/marca');
    expect(visto.headers['authorization'], 'Bearer tok-admin');
    expect(jsonDecode(visto.body), {
      'nombre': 'La Esquina',
      'bajada': 'Almacén',
      'membrete': 'Membrete',
      'pie': 'Pie',
      'fondo': '#FFF',
    });
  });

  test('403 en guardar mapea a ForbiddenException (rol_no_permitido)',
      () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'error': 'rol_no_permitido', 'message': 'Sin permiso.'}),
        403,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await expectLater(
      servicio.guardar(const Marca(
        nombre: 'X',
        bajada: '',
        membrete: '',
        pie: '',
        fondo: '',
      )),
      throwsA(isA<ForbiddenException>()),
    );
  });

  test('500 en obtener mapea a ServerException', () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'message': 'Error interno.'}),
        500,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    await expectLater(servicio.obtener(), throwsA(isA<ServerException>()));
  });

  test('Marca.fromJson acepta todos los campos vacíos', () {
    final marca = Marca.fromJson({});
    expect(marca.nombre, '');
    expect(marca.bajada, '');
    expect(marca.membrete, '');
    expect(marca.pie, '');
    expect(marca.fondo, '');
  });

  test('Marca.toJson produce el JSON exacto para el backend', () {
    const marca = Marca(
      nombre: 'N',
      bajada: 'B',
      membrete: 'M',
      pie: 'P',
      fondo: 'F',
    );
    expect(marca.toJson(), {
      'nombre': 'N',
      'bajada': 'B',
      'membrete': 'M',
      'pie': 'P',
      'fondo': 'F',
    });
  });
}
