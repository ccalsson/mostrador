import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';

ApiClient _cliente(MockClient mock, {String? token = 'tok-1'}) => ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => token,
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    );

Future<void> _esperaError(int status, Matcher matcher) async {
  final client = _cliente(
    MockClient((_) async => http.Response(jsonEncode({'message': 'boom'}), status)),
  );
  await expectLater(
    client.get('/x'),
    throwsA(allOf(
      matcher,
      isA<ApiException>().having((e) => e.message, 'message', 'boom'),
    )),
  );
}

void main() {
  group('cabeceras', () {
    test('GET adjunta Authorization Bearer y accept json', () async {
      late http.Request visto;
      final client = _cliente(MockClient((request) async {
        visto = request;
        return http.Response(jsonEncode({'ok': true}), 200);
      }));

      await client.get('/api/v1/session');

      expect(visto.headers['authorization'], 'Bearer tok-1');
      expect(visto.headers['accept'], 'application/json');
      expect(visto.url.toString(), 'http://api.test/api/v1/session');
    });

    test('sin token no adjunta Authorization', () async {
      late http.Request visto;
      final client = _cliente(
        MockClient((request) async {
          visto = request;
          return http.Response('{}', 200);
        }),
        token: null,
      );

      await client.get('/api/v1/catalogo');

      expect(visto.headers.containsKey('authorization'), isFalse);
    });

    test('POST envía JSON con content-type', () async {
      late http.Request visto;
      final client = _cliente(MockClient((request) async {
        visto = request;
        return http.Response('{}', 200);
      }));

      await client.post('/api/auth/sign-in/email', body: {'email': 'a@b.c'});

      expect(visto.headers['content-type'], startsWith('application/json'));
      expect(jsonDecode(visto.body), {'email': 'a@b.c'});
    });

    test('GET pasa query params', () async {
      late http.Request visto;
      final client = _cliente(MockClient((request) async {
        visto = request;
        return http.Response('{}', 200);
      }));

      await client.get('/api/v1/catalogo', query: {'since': '2026-01-01T00:00:00Z'});

      expect(visto.url.queryParameters['since'], '2026-01-01T00:00:00Z');
    });
  });

  group('errores', () {
    test('401 → UnauthorizedException', () async {
      await _esperaError(401, isA<UnauthorizedException>());
    });

    test('403 → ForbiddenException', () async {
      await _esperaError(403, isA<ForbiddenException>());
    });

    test('404 → NotFoundException', () async {
      await _esperaError(404, isA<NotFoundException>());
    });

    test('409 → ConflictException', () async {
      await _esperaError(409, isA<ConflictException>());
    });

    test('400 → ValidationException', () async {
      await _esperaError(400, isA<ValidationException>());
    });

    test('422 → ValidationException', () async {
      await _esperaError(422, isA<ValidationException>());
    });

    test('500 → ServerException', () async {
      await _esperaError(500, isA<ServerException>());
    });

    test('503 → ServerException', () async {
      await _esperaError(503, isA<ServerException>());
    });

    test('401 con token adjunto dispara onUnauthorized', () async {
      var llamado = false;
      final client = _cliente(MockClient((_) async => http.Response('{}', 401)));
      client.onUnauthorized = () => llamado = true;

      await expectLater(client.get('/x'), throwsA(isA<UnauthorizedException>()));
      expect(llamado, isTrue);
    });

    test('401 sin token adjunto no dispara onUnauthorized', () async {
      var llamado = false;
      final client = _cliente(
        MockClient((_) async => http.Response('{}', 401)),
        token: null,
      );
      client.onUnauthorized = () => llamado = true;

      await expectLater(client.get('/x'), throwsA(isA<UnauthorizedException>()));
      expect(llamado, isFalse);
    });

    test('ClientException → NetworkException', () async {
      final client = _cliente(
        MockClient((request) async => throw http.ClientException('sin red')),
      );
      await expectLater(client.get('/x'), throwsA(isA<NetworkException>()));
    });

    test('cuerpo de error no-JSON igual mapea por status', () async {
      final client = _cliente(MockClient((_) async => http.Response('<html>', 500)));
      await expectLater(
        client.get('/x'),
        throwsA(isA<ServerException>().having(
          (e) => e.message,
          'message',
          'Error interno del servidor.',
        )),
      );
    });
  });

  group('ETag', () {
    test('segundo GET manda if-none-match y reusa el cuerpo cacheado', () async {
      var llamadas = 0;
      final client = _cliente(MockClient((request) async {
        llamadas++;
        if (llamadas == 1) {
          return http.Response(
            jsonEncode({'data': [1, 2]}),
            200,
            headers: {'etag': '"v1"'},
          );
        }
        expect(request.headers['if-none-match'], '"v1"');
        return http.Response('', 304);
      }));

      final primero = await client.get('/api/v1/catalogo');
      final segundo = await client.get('/api/v1/catalogo');

      expect(primero, {'data': [1, 2]});
      expect(segundo, {'data': [1, 2]});
      expect(llamadas, 2);
    });

    test('cambio de token no reusa el cache del token anterior', () async {
      var llamadas = 0;
      late ApiClient client;
      client = ApiClient(
        baseUrl: 'http://api.test',
        tokenProvider: () async => llamadas == 0 ? 'tok-1' : 'tok-2',
        httpClient: MockClient((request) async {
          llamadas++;
          if (llamadas == 2) {
            expect(request.headers.containsKey('if-none-match'), isFalse);
          }
          return http.Response(
            jsonEncode({'n': llamadas}),
            200,
            headers: {'etag': '"v$llamadas"'},
          );
        }),
        timeout: const Duration(seconds: 5),
      );

      await client.get('/api/v1/catalogo');
      final segundo = await client.get('/api/v1/catalogo');

      expect(segundo, {'n': 2});
      expect(llamadas, 2);
    });
  });

  group('decodificación', () {
    test('cuerpo 2xx no-JSON → ApiException', () async {
      final client = _cliente(MockClient((_) async => http.Response('<html>', 200)));
      await expectLater(client.get('/x'), throwsA(isA<ApiException>()));
    });
  });
}
