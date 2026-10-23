import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/models/escritorio.dart';
import 'package:mostrador_flutter/services/escritorio_service.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient — devuelve respuestas predefinidas sin tocar la red.
// ---------------------------------------------------------------------------

class _FakeApiClient extends ApiClient {
  _FakeApiClient(this._response) : super(baseUrl: 'http://localhost:0');
  final ApiResponse _response;

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    return _response;
  }
}

/// HttpHeaders mínimo para tests — el servicio no accede a headers.
class _EmptyHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

ApiResponse _ok(Map<String, dynamic> body) =>
    ApiResponse(200, _EmptyHeaders(), jsonEncode(body));

ApiResponse _status(int code) =>
    ApiResponse(code, _EmptyHeaders(), '{"error":"fail"}');

// ---------------------------------------------------------------------------
// Fixture JSON — mismo shape que GET /api/v1/escritorio
// ---------------------------------------------------------------------------

Map<String, dynamic> _fixtureEscritorio({bool premium = true}) => {
      'premium': premium,
      'margen': {
        'cobrado': 150000,
        'costo': 90000,
        'diferencia': 60000,
        'sinPrecio': 3,
        'serie': [
          {'dia': '2026-10-17', 'cobrado': 20000, 'costo': 12000},
          {'dia': '2026-10-18', 'cobrado': 25000, 'costo': 15000},
        ],
        'entradas': [
          {
            'id': 'rem1',
            'proveedor': 'Verduras SA',
            'cuando': '2026-10-18T10:30:00Z',
            'costo': 15000,
            'lineas': 4,
          },
        ],
      },
      'deudas': [
        {'id': 'cli1', 'nombre': 'Juan Pérez', 'saldo': 5000},
        {'id': 'cli2', 'nombre': 'María López', 'saldo': 3200},
      ],
      'cierres': [
        {
          'id': 'cie1',
          'abiertoAt': '2026-10-18T08:00:00Z',
          'cerradoAt': '2026-10-18T14:00:00Z',
          'esperado': 120000,
          'real': 119500,
          'diferencia': -500,
          'notas': 'Faltó un billete',
          'quien': 'Ana',
        },
      ],
    };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('EscritorioResumen.fromJson', () {
    test('parsea correctamente la respuesta completa', () {
      final resumen = EscritorioResumen.fromJson(_fixtureEscritorio());

      expect(resumen.premium, isTrue);
      expect(resumen.margen.cobrado, 150000);
      expect(resumen.margen.costo, 90000);
      expect(resumen.margen.diferencia, 60000);
      expect(resumen.margen.sinPrecio, 3);
      expect(resumen.margen.serie, hasLength(2));
      expect(resumen.margen.serie.first.dia, '2026-10-17');
      expect(resumen.margen.serie.first.diferencia, 8000);
      expect(resumen.margen.entradas, hasLength(1));
      expect(resumen.margen.entradas.first.proveedor, 'Verduras SA');

      expect(resumen.deudas, hasLength(2));
      expect(resumen.deudas.first.nombre, 'Juan Pérez');
      expect(resumen.deudas.first.saldo, 5000);

      expect(resumen.cierres, hasLength(1));
      expect(resumen.cierres.first.quien, 'Ana');
      expect(resumen.cierres.first.diferencia, -500);
      expect(resumen.cierres.first.notas, 'Faltó un billete');
    });

    test('campos opcioniales con defaults cuando faltan', () {
      final resumen = EscritorioResumen.fromJson({});
      expect(resumen.premium, isFalse);
      expect(resumen.margen.cobrado, 0);
      expect(resumen.margen.serie, isEmpty);
      expect(resumen.deudas, isEmpty);
      expect(resumen.cierres, isEmpty);
    });

    test('entrada sin proveedor usa "Sin proveedor"', () {
      final json = _fixtureEscritorio();
      (json['margen'] as Map)['entradas'] = [
        {'id': 'rem2', 'cuando': '2026-10-19T08:00:00Z', 'costo': 5000, 'lineas': 2},
      ];
      final resumen = EscritorioResumen.fromJson(json);
      expect(resumen.margen.entradas.first.proveedor, 'Sin proveedor');
    });

    test('cierre sin notas usa string vacío', () {
      final json = _fixtureEscritorio();
      (json['cierres'] as List)[0] = {
        'id': 'cie2',
        'cerradoAt': '2026-10-19T14:00:00Z',
        'esperado': 100000,
        'real': 100000,
        'diferencia': 0,
        'quien': 'Luis',
      };
      final resumen = EscritorioResumen.fromJson(json);
      expect(resumen.cierres.first.notas, '');
    });

    test('valores numéricos como string se parsean', () {
      final json = _fixtureEscritorio();
      (json['margen'] as Map)['cobrado'] = '150000.50';
      final resumen = EscritorioResumen.fromJson(json);
      expect(resumen.margen.cobrado, 150000.50);
    });

    test('serie diferencia = cobrado - costo', () {
      final row = SerieRow(dia: '2026-10-20', cobrado: 100, costo: 60);
      expect(row.diferencia, 40);
    });

    test('premium false no afecta el parseo de margen', () {
      final json = _fixtureEscritorio(premium: false);
      final resumen = EscritorioResumen.fromJson(json);
      expect(resumen.premium, isFalse);
      expect(resumen.margen.cobrado, 150000);
    });
  });

  group('DeudaCliente.fromJson', () {
    test('parsea id, nombre y saldo', () {
      final d = DeudaCliente.fromJson({'id': 'x', 'nombre': 'A', 'saldo': 999});
      expect(d.id, 'x');
      expect(d.nombre, 'A');
      expect(d.saldo, 999);
    });
  });

  group('CierreCaja.fromJson', () {
    test('quien por defecto es "Sin nombre"', () {
      final c = CierreCaja.fromJson({
        'id': 'z',
        'cerradoAt': '2026-10-20T14:00:00Z',
        'esperado': 0,
        'real': 0,
        'diferencia': 0,
      });
      expect(c.quien, 'Sin nombre');
    });
  });

  group('EscritorioService.obtener', () {
    test('devuelve EscritorioResumen cuando el status es 200', () async {
      final service = EscritorioService(_FakeApiClient(_ok(_fixtureEscritorio())));
      final resumen = await service.obtener();
      expect(resumen.premium, isTrue);
      expect(resumen.deudas, hasLength(2));
      expect(resumen.cierres, hasLength(1));
    });

    test('lanza EscritorioNoAutorizadoException en 403', () async {
      final service = EscritorioService(_FakeApiClient(_status(403)));
      expect(
        () => service.obtener(),
        throwsA(isA<EscritorioNoAutorizadoException>()),
      );
    });

    test('lanza EscritorioApiException en 500', () async {
      final service = EscritorioService(_FakeApiClient(_status(500)));
      expect(
        () => service.obtener(),
        throwsA(isA<EscritorioApiException>()),
      );
    });

    test('lanza EscritorioApiException en 404', () async {
      final service = EscritorioService(_FakeApiClient(_status(404)));
      expect(
        () => service.obtener(),
        throwsA(isA<EscritorioApiException>()),
      );
    });
  });
}
