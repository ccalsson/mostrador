import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/dashboard.dart';
import 'package:puesto_flutter/services/dashboard_service.dart';

DashboardService _servicio(MockClient mock) => DashboardService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  test('obtener: GET /dashboard con parámetro dias', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({
          'data': {
            'totalVentas': 150000.5,
            'totalCobrado': 140000.0,
            'cantidadPedidos': 15,
            'cantidadCobros': 12,
            'pedidosPendientes': 2,
            'stockBajoCount': 3,
            'porFormaPago': {
              'efectivo': 100000.0,
              'transferencia': 40000.0,
            },
            'alertasSinLeer': 5,
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final resumen = await servicio.obtener(dias: 7);

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/dashboard');
    expect(visto.url.queryParameters, {'dias': '7'});
    expect(visto.headers['authorization'], 'Bearer tok-1');
    expect(resumen.totalVentas, 150000.5);
    expect(resumen.totalCobrado, 140000.0);
    expect(resumen.cantidadPedidos, 15);
    expect(resumen.cantidadCobros, 12);
    expect(resumen.pedidosPendientes, 2);
    expect(resumen.stockBajoCount, 3);
    expect(resumen.porFormaPago['efectivo'], 100000.0);
    expect(resumen.porFormaPago['transferencia'], 40000.0);
    expect(resumen.alertasSinLeer, 5);
  });

  test('DashboardResumen.fromJson tolera respuestas vacías', () {
    final resumen = DashboardResumen.fromJson(const {});
    expect(resumen.totalVentas, 0);
    expect(resumen.totalCobrado, 0);
    expect(resumen.cantidadPedidos, 0);
    expect(resumen.porFormaPago, isEmpty);
  });
}
