import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/clientes_pane.dart';

void main() {
  late List<http.Request> requests;
  late MockClient httpClient;

  setUp(() {
    requests = [];
    httpClient = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET' && request.url.path == '/api/v1/clientes') {
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'cli_1',
                'nombre': 'Almacén Centro',
                'telefono': '1144556677',
                'cuit': '20123456789',
                'direccion': 'Calle 123',
                'cuentaCorriente': true,
                'condicionIva': 'ri',
                'activo': true,
                'saldo': 3000,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (request.method == 'GET' &&
          request.url.path == '/api/v1/clientes/cli_1/cuenta') {
        return http.Response(
          jsonEncode({
            'data': {'saldo': 3000, 'movimientos': []},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (request.method == 'POST') {
        return http.Response(
          jsonEncode({
            'data': {'ok': true},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response('', 404);
    });
  });

  Future<void> abrirPane(
    WidgetTester tester, {
    Size size = const Size(1280, 900),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final apiClient = ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: httpClient,
      timeout: const Duration(seconds: 5),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(apiClient)],
        child: const MaterialApp(home: Scaffold(body: ClientesPane())),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('edita la ficha y envía sus campos completos', (tester) async {
    await abrirPane(tester);
    await tester.tap(find.byKey(const Key('admin_cliente_cli_1')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('admin_cliente_nombre')),
      'Almacén Nuevo',
    );
    await tester.tap(find.byKey(const Key('admin_cliente_guardar')));
    await tester.pumpAndSettle();

    final request = requests.singleWhere(
      (request) =>
          request.method == 'POST' &&
          request.url.path == '/api/v1/clientes/cli_1',
    );
    expect(jsonDecode(request.body), {
      'nombre': 'Almacén Nuevo',
      'telefono': '1144556677',
      'cuit': '20123456789',
      'direccion': 'Calle 123',
      'cuentaCorriente': true,
      'condicionIva': 'ri',
      'activo': true,
    });
  });

  testWidgets('registra pago y actualiza cuenta y lista', (tester) async {
    await abrirPane(tester, size: const Size(390, 844));
    await tester.tap(find.byTooltip('Ver cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin_cliente_registrar_pago')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('admin_cliente_pago_monto')),
      '1250,50',
    );
    await tester.enterText(
      find.byKey(const Key('admin_cliente_pago_nota')),
      'Pago parcial',
    );
    await tester.tap(find.byKey(const Key('admin_cliente_pago_guardar')));
    await tester.pumpAndSettle();

    final request = requests.singleWhere(
      (request) =>
          request.method == 'POST' &&
          request.url.path == '/api/v1/clientes/cli_1/pagos',
    );
    expect(jsonDecode(request.body), {'monto': 1250.5, 'nota': 'Pago parcial'});
    expect(
      requests.where(
        (request) =>
            request.method == 'GET' &&
            request.url.path == '/api/v1/clientes/cli_1/cuenta',
      ),
      hasLength(2),
    );
  });
}
