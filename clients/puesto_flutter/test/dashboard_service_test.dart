import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/models/dashboard.dart';
import 'package:puesto_flutter/services/dashboard_service.dart';

/// Payload tal como lo arma `dashboardResumenForStaff` en
/// `app/src/lib/server/panel.ts` (respaldo real del contrato).
Map<String, dynamic> _payloadBackend({int dias = 7}) => {
      'dias': dias,
      'ventas': 150000,
      'ventasPrev': 100000,
      'tickets': 12,
      'ticketsPrev': 8,
      'ticketPromedio': 12500,
      'enCola': 3,
      'series': [
        {'dia': '2026-10-15', 'total': 20000, 'n': 2},
        {'dia': '2026-10-16', 'total': 30000, 'n': 3},
      ],
      'top': [
        {'nombre': 'Mate', 'cantidad': 40, 'total': 12000},
        {'nombre': 'Factura', 'cantidad': 12, 'total': 6000},
      ],
      'formas': [
        {'formaPago': 'efectivo', 'total': 100000, 'n': 7},
        {'formaPago': 'transferencia', 'total': 50000, 'n': 5},
      ],
      'movimientos': [
        {
          'id': 'c-1',
          'monto': 5000,
          'formaPago': 'efectivo',
          'createdAt': '2026-10-16 12:34:00',
          'cliente': 'Ana',
          'numero': 118,
          'productos': 'Mate, Factura',
        },
      ],
      'cola': [
        {
          'id': 'p-1',
          'cliente': 'Beto',
          'estado': 'en_preparacion',
          'createdAt': '2026-10-16 12:30:00',
          'total': 8000,
          'vendedor': 'Vale',
        },
      ],
    };

DashboardService _servicio(MockClient mock) => DashboardService(ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: mock,
      timeout: const Duration(seconds: 5),
    ));

void main() {
  test('obtener: GET /dashboard con parámetro dias y Bearer', () async {
    late http.Request visto;
    final servicio = _servicio(MockClient((request) async {
      visto = request;
      return http.Response(
        jsonEncode({'data': _payloadBackend(dias: 7)}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final resumen = await servicio.obtener(dias: 7);

    expect(visto.method, 'GET');
    expect(visto.url.path, '/api/v1/dashboard');
    expect(visto.url.queryParameters, {'dias': '7'});
    expect(visto.headers['authorization'], 'Bearer tok-1');
    expect(resumen.dias, 7);
  });

  test('DashboardResumen parsea el payload real del backend', () async {
    final servicio = _servicio(MockClient((request) async {
      return http.Response(
        jsonEncode({'data': _payloadBackend(dias: 7)}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }));

    final r = await servicio.obtener(dias: 7);

    expect(r.dias, 7);
    expect(r.ventas, 150000);
    expect(r.ventasPrev, 100000);
    expect(r.tickets, 12);
    expect(r.ticketsPrev, 8);
    expect(r.ticketPromedio, 12500);
    expect(r.enCola, 3);
    expect(r.series.length, 2);
    expect(r.series.first.dia, '2026-10-15');
    expect(r.series.first.total, 20000);
    expect(r.top.first.nombre, 'Mate');
    expect(r.formas.first.formaPago, 'efectivo');
    expect(r.movimientos.first.cliente, 'Ana');
    expect(r.movimientos.first.numero, 118);
    expect(r.cola.first.vendedor, 'Vale');
  });

  test('Deltas percentuales vs período anterior', () {
    final r = DashboardResumen.fromJson(_payloadBackend());
    expect(r.deltaVentasPct()!, closeTo(50.0, 0.001));
    expect(r.deltaTicketsPct()!, closeTo(50.0, 0.001));
  });

  test('Delta null cuando no hay base (ventasPrev = 0)', () {
    final r = DashboardResumen.fromJson(
      {..._payloadBackend(), 'ventasPrev': 0, 'ticketsPrev': 0},
    );
    expect(r.deltaVentasPct(), isNull);
    expect(r.deltaTicketsPct(), isNull);
  });

  test('DashboardResumen.fromJson tolera payload vacío', () {
    final r = DashboardResumen.fromJson(const {});
    expect(r.dias, 7);
    expect(r.ventas, 0);
    expect(r.series, isEmpty);
    expect(r.movimientos, isEmpty);
    expect(r.cola, isEmpty);
  });
}
