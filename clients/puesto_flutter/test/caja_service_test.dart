import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/caja.dart';
import 'package:puesto_flutter/services/caja_service.dart';

CajaService _servicio(MockClient mock) => CajaService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

class _CajaFake implements CajaService {
  _CajaFake(this.estadoPara);

  final Future<CajaEstado> Function(int llamada) estadoPara;
  var llamadas = 0;

  @override
  Future<CajaEstado> estado() {
    llamadas++;
    return estadoPara(llamadas);
  }
}

CajaEstado _estado({double esperado = 0}) => CajaEstado(
      id: 'cje_1',
      abiertoAt: '2026-10-01 22:27:06.909015+00',
      esperado: esperado,
      totales: const [],
      ultimos: const [],
    );

void main() {
  group('parsing', () {
    test('respuesta real del contrato: totales y últimos cobros', () async {
      late http.Request visto;
      final servicio = _servicio(MockClient((request) async {
        visto = request;
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'cje_396ce29d87ac47a7',
              'abiertoAt': '2026-10-01 22:27:06.909015+00',
              'esperado': 79200,
              'totales': [
                {'formaPago': 'efectivo', 'total': 79200, 'n': 11},
              ],
              'ultimos': [
                {
                  'id': 'cob_1',
                  'monto': 7200,
                  'formaPago': 'efectivo',
                  'createdAt': '2026-10-02 02:50:04.142348+00',
                  'cliente': 'Mostrador E2E',
                  'numero': 1090,
                  'facturaId': null,
                  'cae': null,
                },
                {
                  'id': 'cob_2',
                  'monto': 1500.5,
                  'formaPago': 'transferencia',
                  'createdAt': '2026-10-02 01:00:00+00',
                  'cliente': 'Mostrador',
                  'numero': null,
                  'facturaId': 'fac_1',
                  'cae': '75000000000000',
                },
              ],
            },
          }),
          200,
        );
      }));

      final caja = await servicio.estado();

      expect(visto.url.path, '/api/v1/caja');
      expect(visto.headers['authorization'], 'Bearer tok-1');
      expect(caja.id, 'cje_396ce29d87ac47a7');
      expect(caja.abiertoAt, '2026-10-01 22:27:06.909015+00');
      expect(caja.esperado, 79200);
      expect(caja.totales.single.formaPagoLabel, 'Efectivo');
      expect(caja.totales.single.total, 79200);
      expect(caja.totales.single.n, 11);
      expect(caja.ultimos.length, 2);
      final primero = caja.ultimos.first;
      expect(primero.id, 'cob_1');
      expect(primero.monto, 7200);
      expect(primero.cliente, 'Mostrador E2E');
      expect(primero.numero, 1090);
      expect(primero.facturaId, isNull);
      expect(primero.cae, isNull);
      final segundo = caja.ultimos[1];
      expect(segundo.numero, isNull);
      expect(segundo.facturaId, 'fac_1');
      expect(segundo.cae, '75000000000000');
      expect(segundo.formaPagoLabel, 'Transferencia');
    });

    test('turno recién abierto: arrays vacíos y opcionales ausentes', () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({
              'data': {
                'id': 'cje_nuevo',
                'abiertoAt': '2026-10-02 09:00:00+00',
                'esperado': 0,
                'totales': [],
                'ultimos': [
                  {
                    'id': 'cob_sin_extras',
                    'monto': 500,
                    'formaPago': 'efectivo',
                    'createdAt': '2026-10-02 09:01:00+00',
                    'cliente': 'Mostrador',
                  },
                ],
              },
            }),
            200,
          )));

      final caja = await servicio.estado();

      expect(caja.totales, isEmpty);
      final cobro = caja.ultimos.single;
      expect(cobro.numero, isNull);
      expect(cobro.facturaId, isNull);
      expect(cobro.cae, isNull);
    });

    test('forma de pago desconocida: la etiqueta cae al valor crudo', () {
      final total = TotalFormaPago.fromJson(
        const {'formaPago': 'cripto', 'total': 10, 'n': 1},
      );
      expect(total.formaPagoLabel, 'cripto');
      expect(
        TotalFormaPago.fromJson(
          const {'formaPago': 'cuenta_corriente', 'total': 0, 'n': 0},
        ).formaPagoLabel,
        'Cuenta corriente',
      );
    });
  });

  group('errores HTTP', () {
    test('403 del vendedor → ForbiddenException con el mensaje del backend',
        () async {
      final servicio = _servicio(MockClient((_) async => http.Response(
            jsonEncode({
              'error': 'forbidden',
              'message': 'No tenés permiso para esta acción.',
            }),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          )));

      await expectLater(
        servicio.estado(),
        throwsA(
          isA<ForbiddenException>().having(
            (e) => e.message,
            'message',
            'No tenés permiso para esta acción.',
          ),
        ),
      );
    });

    test('500 → ServerException', () async {
      final servicio =
          _servicio(MockClient((_) async => http.Response('boom', 500)));

      await expectLater(servicio.estado(), throwsA(isA<ServerException>()));
    });
  });

  group('provider', () {
    test('cajaEstadoProvider expone la respuesta del servicio', () async {
      final fake = _CajaFake((_) async => _estado(esperado: 1500));
      final container = ProviderContainer(
        overrides: [cajaServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final caja = await container.read(cajaEstadoProvider.future);

      expect(caja.id, 'cje_1');
      expect(caja.esperado, 1500);
      expect(fake.llamadas, 1);
    });

    test('el error del servicio se propaga sin reintentos automáticos',
        () async {
      final fake = _CajaFake(
        (_) async => throw ForbiddenException('No tenés permiso para esta acción.'),
      );
      final container = ProviderContainer(
        overrides: [cajaServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      await expectLater(
        container.read(cajaEstadoProvider.future),
        throwsA(isA<ForbiddenException>()),
      );
      expect(fake.llamadas, 1,
          reason: 'sin retry, un error determinista no se reintenta');
    });
  });
}
