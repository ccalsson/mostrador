import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/features/admin/addons_pane.dart';
import 'package:mostrador_flutter/services/addons_service.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient para widget tests
// ---------------------------------------------------------------------------

class _FakeApiClient extends ApiClient {
  _FakeApiClient(this._responses) : super(baseUrl: 'http://localhost:0');
  final Map<String, ApiResponse> _responses;
  final List<String> llamadas = [];

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    llamadas.add('GET $path');
    return _responses['GET $path'] ?? _responses[path] ?? ApiResponse(404, _EmptyHeaders(), '{"error":"not_found"}');
  }

  @override
  Future<ApiResponse> post(String path, {Object? body, Map<String, String>? headers}) async {
    llamadas.add('POST $path');
    return _responses['POST $path'] ?? _responses[path] ?? ApiResponse(404, _EmptyHeaders(), '{"error":"not_found"}');
  }
}

class _EmptyHeaders implements HttpHeaders {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

ApiResponse _ok(Map<String, dynamic> body) =>
    ApiResponse(200, _EmptyHeaders(), jsonEncode(body));

ApiResponse _status(int code, {String body = '{"error":"fail"}'}) =>
    ApiResponse(code, _EmptyHeaders(), body);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

Map<String, dynamic> _addonJson({
  String id = 'addon_1',
  String nombre = 'Mercado',
  String descripcion = 'Vendé online',
  double precioUSD = 15.0,
  double precioARS = 25000.0,
  bool contratado = false,
}) =>
    {
      'id': id,
      'nombre': nombre,
      'descripcion': descripcion,
      'precioUSD': precioUSD,
      'precioARS': precioARS,
      'icono': 'mercado',
      'contratado': contratado,
    };

Map<String, dynamic> _contratoJson({
  String id = 'doc_1',
  String titulo = 'Uso de la app',
  int version = 1,
  String hash = 'abc',
  bool aceptado = false,
}) =>
    {
      'id': id,
      'titulo': titulo,
      'version': version,
      'hash': hash,
      'aceptado': aceptado,
    };

AddonsPane _buildPane(ApiClient client) =>
    AddonsPane(service: AddonsService(client));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('AddonsPane widget', () {
    testWidgets('muestra indicador de carga al inicio', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [_addonJson()],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('muestra catálogo con tarjetas de add-ons', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [
            _addonJson(id: 'a1', nombre: 'Mercado'),
            _addonJson(id: 'a2', nombre: 'Mensajería'),
          ],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Mercado'), findsOneWidget);
      expect(find.text('Mensajería'), findsOneWidget);
      expect(find.text('Comprar'), findsNWidgets(2));
    });

    testWidgets('muestra sección de contratados', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [
            _addonJson(id: 'a1', nombre: 'Mercado', contratado: true),
          ],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Contratados'), findsOneWidget);
      expect(find.text('Mercado'), findsOneWidget);
      expect(find.text('Activo'), findsOneWidget);
    });

    testWidgets('muestra mensaje cuando no hay add-ons disponibles', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({'addons': []}),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('No hay add-ons disponibles para comprar.'), findsOneWidget);
    });

    testWidgets('muestra mensaje cuando no hay contratados', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [_addonJson()],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Todavía no contrataste ningún add-on.'), findsOneWidget);
    });

    testWidgets('muestra error con botón reintentar en fallo de API', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _status(500),
        'GET /api/v1/addons/contratos': _status(500),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('Error al cargar los add-ons.'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
    });

    testWidgets('abre dialog de compra al tocar Comprar', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [_addonJson()],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Comprar'));
      await tester.pumpAndSettle();

      // El dialog debe mostrar el nombre del add-on y los contratos.
      expect(find.text('Comprar Mercado'), findsOneWidget);
      expect(find.text('Uso de la app'), findsOneWidget);
      expect(find.text('Add-ons'), findsOneWidget);
    });

    testWidgets('botón Confirmar está deshabilitado sin aceptar contratos', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [_addonJson()],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Comprar'));
      await tester.pumpAndSettle();

      // El botón Confirmar debe estar deshabilitado.
      final confirmButton = find.widgetWithText(FilledButton, 'Confirmar');
      final button = tester.widget<FilledButton>(confirmButton);
      expect(button.onPressed, isNull);
    });

    testWidgets('muestra precios en USD y ARS en la tarjeta', (tester) async {
      final client = _FakeApiClient({
        'GET /api/v1/addons': _ok({
          'addons': [_addonJson(precioUSD: 15.0, precioARS: 25000.0)],
        }),
        'GET /api/v1/addons/contratos': _ok({
          'contratos': [_contratoJson(), _contratoJson(id: 'doc_2', titulo: 'Add-ons')],
        }),
      });
      await tester.pumpWidget(MaterialApp(home: _buildPane(client)));
      await tester.pumpAndSettle();

      expect(find.text('USD 15.00'), findsOneWidget);
      expect(find.text('\$25.000'), findsOneWidget);
    });
  });
}
