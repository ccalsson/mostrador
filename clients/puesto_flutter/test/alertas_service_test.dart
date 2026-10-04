import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/alerta.dart';
import 'package:puesto_flutter/services/alertas_service.dart';

AlertasService _servicio(MockClient mock) => AlertasService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  test('listar: GET /alertas y parsea la lista del contrato', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': [
            {
              'id': 'alr_1',
              'tipo': 'stock_bajo',
              'mensaje': 'Banana: stock bajo (2 kg, mínimo 10).',
              'leida': false,
              'createdAt': '2026-10-03 11:22:33.444+00',
            },
            {
              'id': 'alr_2',
              'tipo': 'otra',
              'mensaje': 'Algo pasó',
              'leida': true,
              'createdAt': '2026-10-02 09:00:00+00',
            },
          ],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final alertas = await servicio.listar();

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/alertas');
    expect(visto.headers['authorization'], 'Bearer tok-1');
    expect(alertas.length, 2);
    expect(alertas.first.id, 'alr_1');
    expect(alertas.first.tipo, 'stock_bajo');
    expect(alertas.first.mensaje, contains('Banana'));
    expect(alertas.first.leida, isFalse);
    expect(alertas.first.creada, '2026-10-03 11:22:33.444+00');
    expect(alertas.last.leida, isTrue);
  });

  test('Alerta.fromJson tolera campos ausentes', () {
    final alerta = Alerta.fromJson(const {'id': 'alr_min'});
    expect(alerta.tipo, '');
    expect(alerta.mensaje, '');
    expect(alerta.leida, isFalse);
    expect(alerta.creada, '');
  });

  test('marcarLeida: POST /alertas/{id}/leida sin cuerpo', () async {
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

    await servicio.marcarLeida('alr_1');

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/alertas/alr_1/leida');
    expect(visto.body, isEmpty);
  });
}
