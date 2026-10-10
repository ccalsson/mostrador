import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/services/anulaciones_service.dart';

AnulacionesService _servicio(MockClient mock) => AnulacionesService(
  ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-1',
    httpClient: mock,
    timeout: const Duration(seconds: 5),
  ),
);

void main() {
  test(
    'anular pedido envía motivo al endpoint y exige confirmación del backend',
    () async {
      late http.Request visto;
      final servicio = _servicio(
        MockClient((request) async {
          visto = request;
          return http.Response(
            jsonEncode({
              'data': {'id': 'ped_1', 'estado': 'anulado'},
            }),
            200,
          );
        }),
      );

      await servicio.pedido('ped_1', motivo: 'Pedido duplicado');

      expect(visto.method, 'POST');
      expect(visto.url.path, '/api/v1/pedidos/ped_1/anular');
      expect(jsonDecode(visto.body), {'motivo': 'Pedido duplicado'});
    },
  );

  test('anular cobro usa el endpoint fiscalmente protegido', () async {
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

    await servicio.cobro('cob_1', motivo: 'Venta duplicada');

    expect(visto.method, 'POST');
    expect(visto.url.path, '/api/v1/cobros/cob_1/anular');
    expect(jsonDecode(visto.body), {'motivo': 'Venta duplicada'});
  });

  test(
    'conserva el error del backend si el cobro tiene factura electrónica',
    () async {
      final servicio = _servicio(
        MockClient(
          (_) async => http.Response(
            jsonEncode({
              'error': 'invalid_request',
              'message': 'Emití la nota de crédito antes de anular.',
            }),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );

      await expectLater(
        servicio.cobro('cob_1', motivo: 'Error'),
        throwsA(
          isA<ValidationException>().having(
            (error) => error.message,
            'message',
            'Emití la nota de crédito antes de anular.',
          ),
        ),
      );
    },
  );
}
