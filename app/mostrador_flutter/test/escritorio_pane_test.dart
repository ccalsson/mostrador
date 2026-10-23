import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/features/admin/escritorio_pane.dart';
import 'package:mostrador_flutter/services/escritorio_service.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient para widget tests
// ---------------------------------------------------------------------------

class _FakeApiClient extends ApiClient {
  _FakeApiClient(this._response) : super(baseUrl: 'http://localhost:0');
  final ApiResponse _response;

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    return _response;
  }
}

class _EmptyHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

ApiResponse _ok(Map<String, dynamic> body) =>
    ApiResponse(200, _EmptyHeaders(), jsonEncode(body));

ApiResponse _status(int code) =>
    ApiResponse(code, _EmptyHeaders(), '{"error":"fail"}');

Map<String, dynamic> _fixturePremium() => {
      'premium': true,
      'margen': {
        'cobrado': 150000,
        'costo': 90000,
        'diferencia': 60000,
        'sinPrecio': 3,
        'serie': [
          {'dia': '2026-10-17', 'cobrado': 20000, 'costo': 12000},
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
      ],
      'cierres': [
        {
          'id': 'cie1',
          'cerradoAt': '2026-10-18T14:00:00Z',
          'esperado': 120000,
          'real': 119500,
          'diferencia': -500,
          'notas': 'Faltó un billete',
          'quien': 'Ana',
        },
      ],
    };

Map<String, dynamic> _fixtureNoPremium() => {
      'premium': false,
      'margen': {'cobrado': 0, 'costo': 0, 'diferencia': 0, 'sinPrecio': 0, 'serie': [], 'entradas': []},
      'deudas': [],
      'cierres': [],
    };

EscritorioPane _buildPane(ApiClient client) =>
    EscritorioPane(service: EscritorioService(client));

void main() {
  group('EscritorioPane widget', () {
    testWidgets('muestra indicador de carga al inicio', (tester) async {
      // Usamos un future que nunca completa para mantener el estado de carga.
      final client = _FakeApiClient(_ok(_fixturePremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('muestra las 3 tabs: Margen, Deudas, Cierres', (tester) async {
      final client = _FakeApiClient(_ok(_fixturePremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Margen'), findsWidgets);
      expect(find.text('Deudas'), findsWidgets);
      expect(find.text('Cierres'), findsWidgets);
    });

    testWidgets('tab Margen muestra KPIs con datos premium', (tester) async {
      final client = _FakeApiClient(_ok(_fixturePremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('COBRADO, 7 DÍAS'), findsOneWidget);
      expect(find.text('MERCADERÍA ENTRADA'), findsOneWidget);
      expect(find.text('DIFERENCIA'), findsOneWidget);
      expect(find.text('SIN PRECIO DE COMPRA'), findsOneWidget);
    });

    testWidgets('tab Deudas muestra clientes y total', (tester) async {
      final client = _FakeApiClient(_ok(_fixturePremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      // Navegar a tab Deudas
      await tester.tap(find.text('Deudas').last);
      await tester.pumpAndSettle();

      expect(find.text('Juan Pérez'), findsOneWidget);
      expect(find.text('Te deben'), findsOneWidget);
      expect(find.text('Ver cuenta'), findsOneWidget);
    });

    testWidgets('tab Cierres muestra tabla con datos', (tester) async {
      final client = _FakeApiClient(_ok(_fixturePremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      // Navegar a tab Cierres
      await tester.tap(find.text('Cierres').last);
      await tester.pumpAndSettle();

      expect(find.text('Cierres de caja'), findsOneWidget);
      expect(find.text('Ana'), findsOneWidget);
      expect(find.text('Faltó un billete'), findsOneWidget);
    });

    testWidgets('muestra mensaje "Premium requerido" cuando no es premium', (tester) async {
      final client = _FakeApiClient(_ok(_fixtureNoPremium()));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Margen, deudas y cierres son del plan Premium.'), findsOneWidget);
    });

    testWidgets('muestra error con botón reintentar en fallo de API', (tester) async {
      final client = _FakeApiClient(_status(500));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Error al cargar el escritorio.'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
    });

    testWidgets('muestra mensaje de sin permisos en 403', (tester) async {
      final client = _FakeApiClient(_status(403));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('No tenés permisos para ver el escritorio.'), findsOneWidget);
    });

    testWidgets('tab Deudas vacío muestra mensaje', (tester) async {
      final fixture = _fixturePremium();
      fixture['deudas'] = [];
      final client = _FakeApiClient(_ok(fixture));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Deudas').last);
      await tester.pumpAndSettle();

      expect(find.text('Nadie tiene saldo a favor del puesto.'), findsOneWidget);
    });

    testWidgets('tab Cierres vacío muestra mensaje', (tester) async {
      final fixture = _fixturePremium();
      fixture['cierres'] = [];
      final client = _FakeApiClient(_ok(fixture));
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cierres').last);
      await tester.pumpAndSettle();

      expect(find.text('Todavía no hay un turno cerrado.'), findsOneWidget);
    });
  });
}
