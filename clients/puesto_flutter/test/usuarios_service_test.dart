import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/staff_session.dart';
import 'package:puesto_flutter/models/usuario.dart';
import 'package:puesto_flutter/services/usuarios_service.dart';

UsuariosService _servicio(MockClient mock) => UsuariosService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  group('listar', () {
    test('GET /usuarios y parsea la lista del contrato', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'u_1',
                'nombre': 'Ana Pérez',
                'email': 'ana@test.com',
                'rol': 'vendedor',
                'activo': true,
              },
              {
                'id': 'u_2',
                'nombre': 'Juan García',
                'email': 'juan@test.com',
                'rol': 'cajero',
                'activo': false,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final usuarios = await servicio.listar();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/usuarios');
      expect(visto.headers['authorization'], 'Bearer tok-1');
      expect(usuarios.length, 2);
      expect(usuarios[0].id, 'u_1');
      expect(usuarios[0].nombre, 'Ana Pérez');
      expect(usuarios[0].rol, Rol.vendedor);
      expect(usuarios[0].activo, isTrue);
      expect(usuarios[1].id, 'u_2');
      expect(usuarios[1].rol, Rol.cajero);
      expect(usuarios[1].activo, isFalse);
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
        servicio.listar(),
        throwsA(isA<ForbiddenException>()),
      );
    });
  });

  group('crear', () {
    test('POST /usuarios con nombre, email, password y rol', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {'ok': true},
          }),
          201,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await servicio.crear(const UsuarioInput(
        nombre: 'María Gómez',
        email: 'maria@test.com',
        password: 'roman2026',
        rol: Rol.admin,
      ));

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/usuarios');
      expect(jsonDecode(visto.body), {
        'nombre': 'María Gómez',
        'email': 'maria@test.com',
        'password': 'roman2026',
        'rol': 'admin',
      });
    });

    test('400 → ValidationException (email inválido)', () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({
              'error': 'invalid_request',
              'message': 'El email no es válido.',
            }),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )));

      await expectLater(
        servicio.crear(const UsuarioInput(
          nombre: 'X',
          email: 'no-es-email',
          password: 'pw123',
          rol: Rol.vendedor,
        )),
        throwsA(isA<ValidationException>().having(
          (e) => e.message,
          'message',
          contains('email'),
        )),
      );
    });
  });

  group('toggle', () {
    test('POST /usuarios/{id}/toggle con activo=false', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({'data': {'ok': true}}),
          200,
        );
      }));

      await servicio.toggle('u_1', activo: false);

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/usuarios/u_1/toggle');
      expect(jsonDecode(visto.body), {'activo': false});
    });

    test('Usuario.fromJson tolera campos ausentes', () {
      final u = Usuario.fromJson(const <String, dynamic>{'id': 'u_min'});
      expect(u.nombre, '');
      expect(u.email, '');
      expect(u.rol, Rol.vendedor);
      expect(u.activo, isTrue);
    });
  });
}
