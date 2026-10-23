import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/creativo.dart';
import 'package:puesto_flutter/services/creativos_service.dart';

CreativosService _servicio(MockClient mock) => CreativosService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-admin',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

const _estadoCompleto = {
  'data': {
    'creditos': 20,
    'costo': 4,
    'textos': 4,
    'piezas': ['banner', 'push'],
    'paquetes': [
      {'id': 'prod_creditos_50', 'creditos': 50, 'usd': 5.99},
      {'id': 'prod_creditos_100', 'creditos': 100, 'usd': 9.99},
    ],
    'pedidos': [
      {
        'id': 'crea_001',
        'formato': 'banner',
        'estado': 'listo',
        'brief': 'Tomate perita de hoy',
        'creditos': 4,
        'createdAt': '2026-10-25T10:30:00Z',
        'variantes': [
          {
            'id': 'var_001',
            'n': 1,
            'titulo': 'Tomate fresco',
            'texto': 'Perita del día, precio de puesto',
            'imagen': 'https://ejemplo.com/img.png',
          },
        ],
      },
    ],
  },
};

void main() {
  group('CreativosService.listar', () {
    test('GET /api/v1/creativos y parseo completo', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(jsonEncode(_estadoCompleto), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }));

      final estado = await servicio.listar();

      expect(visto.method, 'GET');
      expect(visto.url.path, '/api/v1/creativos');
      expect(visto.headers['authorization'], 'Bearer tok-admin');
      expect(estado.creditos, 20);
      expect(estado.costo, 4);
      expect(estado.textos, 4);
      expect(estado.piezas, [TipoCreativo.banner, TipoCreativo.push]);
      expect(estado.paquetes, hasLength(2));
      expect(estado.paquetes.first.creditos, 50);
      expect(estado.pedidos, hasLength(1));
      expect(estado.pedidos.first.id, 'crea_001');
      expect(estado.pedidos.first.tipo, TipoCreativo.banner);
      expect(estado.pedidos.first.estado, EstadoCreativo.listo);
      expect(estado.pedidos.first.variantes, hasLength(1));
    });

    test('tolera campos ausentes (null → valores por defecto)', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({'data': {}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final estado = await servicio.listar();

      expect(estado.creditos, 0);
      expect(estado.costo, 4);
      expect(estado.textos, 4);
      expect(estado.piezas, isEmpty);
      expect(estado.paquetes, isEmpty);
      expect(estado.pedidos, isEmpty);
    });

    test('500 mapea a ServerException', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'Error interno.'}),
          500,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await expectLater(servicio.listar(), throwsA(isA<ServerException>()));
    });
  });

  group('CreativosService.generar', () {
    test('POST /api/v1/creativos con formato y brief', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'crea_nuevo',
              'formato': 'banner',
              'creditos': 4,
              'saldo': 16,
              'variantes': [
                {
                  'id': 'var_nueva',
                  'n': 1,
                  'titulo': 'Nuevo título',
                  'texto': 'Nuevo texto',
                  'imagen': 'https://ejemplo.com/nueva.png',
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final resultado = await servicio.generar(
        tipo: TipoCreativo.banner,
        brief: 'Tomate perita de hoy',
      );

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/creativos');
      final body = jsonDecode(visto.body) as Map<String, dynamic>;
      expect(body['formato'], 'banner');
      expect(body['brief'], 'Tomate perita de hoy');
      expect(body.containsKey('fotoUrl'), false);
      expect(resultado.id, 'crea_nuevo');
      expect(resultado.formato, TipoCreativo.banner);
      expect(resultado.creditos, 4);
      expect(resultado.saldo, 16);
      expect(resultado.variantes, hasLength(1));
    });

    test('incluye fotoUrl cuando se provee', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'crea_foto',
              'formato': 'push',
              'creditos': 4,
              'saldo': 12,
              'variantes': [],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await servicio.generar(
        tipo: TipoCreativo.push,
        brief: 'Oferta del día',
        fotoUrl: 'https://ejemplo.com/foto.jpg',
      );

      final body = jsonDecode(visto.body) as Map<String, dynamic>;
      expect(body['fotoUrl'], 'https://ejemplo.com/foto.jpg');
    });

    test('402 (sin créditos) mapea a ApiException', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'No alcanzan los créditos.'}),
          400,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await expectLater(
        servicio.generar(tipo: TipoCreativo.banner, brief: 'Test'),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('CreativosService.enviar', () {
    test('POST /api/v1/creativos/{id}/enviar', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }));

      await servicio.enviar('crea_001');

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/creativos/crea_001/enviar');
    });

    test('404 mapea a NotFoundException', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'No encontrado.'}),
          404,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await expectLater(
        servicio.enviar('crea_inexistente'),
        throwsA(isA<NotFoundException>()),
      );
    });
  });

  group('CreativosService.borrar', () {
    test('DELETE /api/v1/creativos/{id}', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }));

      await servicio.borrar('crea_001');

      expect(visto.method, 'DELETE');
      expect(visto.url.path, '/api/v1/creativos/crea_001');
    });

    test('403 mapea a ForbiddenException', () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({'message': 'Sin permiso.'}),
          403,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      await expectLater(
        servicio.borrar('crea_001'),
        throwsA(isA<ForbiddenException>()),
      );
    });
  });

  group('Modelos', () {
    test('TipoCreativo.nombre devuelve la etiqueta legible', () {
      expect(TipoCreativo.banner.nombre, 'Banner');
      expect(TipoCreativo.push.nombre, 'Push');
      expect(TipoCreativo.etiqueta.nombre, 'Etiqueta');
    });

    test('TipoCreativo.desde parsea correctamente', () {
      expect(TipoCreativo.desde('banner'), TipoCreativo.banner);
      expect(TipoCreativo.desde('push'), TipoCreativo.push);
      expect(TipoCreativo.desde('invalido'), null);
      expect(TipoCreativo.desde(null), null);
    });

    test('EstadoCreativo.desde parsea correctamente', () {
      expect(EstadoCreativo.desde('listo'), EstadoCreativo.listo);
      expect(EstadoCreativo.desde('enviado'), EstadoCreativo.enviado);
      expect(EstadoCreativo.desde('desconocido'), null);
    });

    test('VarianteCreativo.fromJson acepta campos opcionales', () {
      final variante = VarianteCreativo.fromJson({
        'id': 'var_001',
        'n': 1,
        'titulo': 'Título',
        'texto': 'Texto',
        'imagen': 'https://ejemplo.com/img.png',
      });
      expect(variante.id, 'var_001');
      expect(variante.n, 1);
      expect(variante.titulo, 'Título');
      expect(variante.texto, 'Texto');
      expect(variante.imagen, 'https://ejemplo.com/img.png');
    });

    test('Creativo.fromJson mapea formato a tipo y estado', () {
      final creativo = Creativo.fromJson({
        'id': 'crea_001',
        'formato': 'push',
        'estado': 'borrador',
        'brief': 'Test brief',
        'creditos': 4,
        'createdAt': '2026-10-25T10:00:00Z',
        'variantes': [],
      });
      expect(creativo.tipo, TipoCreativo.push);
      expect(creativo.estado, EstadoCreativo.borrador);
      expect(creativo.brief, 'Test brief');
    });

    test('PaqueteCreditos.fromJson parsea correctamente', () {
      final paquete = PaqueteCreditos.fromJson({
        'id': 'prod_creditos_50',
        'creditos': 50,
        'usd': 5.99,
      });
      expect(paquete.id, 'prod_creditos_50');
      expect(paquete.creditos, 50);
      expect(paquete.usd, 5.99);
    });

    test('ResultadoGeneracion.fromJson parsea correctamente', () {
      final resultado = ResultadoGeneracion.fromJson({
        'id': 'crea_nuevo',
        'formato': 'banner',
        'creditos': 4,
        'saldo': 16,
        'variantes': [
          {
            'id': 'var_001',
            'n': 1,
            'titulo': 'Título',
            'texto': 'Texto',
            'imagen': 'https://ejemplo.com/img.png',
          },
        ],
      });
      expect(resultado.id, 'crea_nuevo');
      expect(resultado.formato, TipoCreativo.banner);
      expect(resultado.creditos, 4);
      expect(resultado.saldo, 16);
      expect(resultado.variantes, hasLength(1));
    });
  });
}
