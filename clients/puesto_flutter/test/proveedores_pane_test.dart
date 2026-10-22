import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/proveedores_pane.dart';

void main() {
  testWidgets('edita proveedor y relee la lista compartida', (tester) async {
    var lecturas = 0;
    late http.Request actualizacion;
    final client = MockClient((request) async {
      if (request.method == 'GET' &&
          request.url.path == '/api/v1/proveedores') {
        lecturas++;
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'prv_1',
                'nombre': lecturas == 1 ? 'Distribuidora Norte' : 'Norte SRL',
                'telefono': '112233',
                'activo': true,
              },
            ],
          }),
          200,
        );
      }
      if (request.method == 'GET' &&
          request.url.path == '/api/v1/proveedores/prv_1/productos') {
        return http.Response('{"data":{"productos":["Albahaca"]}}', 200);
      }
      if (request.method == 'POST' &&
          request.url.path == '/api/v1/proveedores/prv_1') {
        actualizacion = request;
        return http.Response('{"data":{"ok":true}}', 200);
      }
      return http.Response('{"error":{"message":"Ruta inesperada"}}', 404);
    });
    final api = ApiClient(
      baseUrl: 'http://api.test',
      tokenProvider: () async => 'tok-1',
      httpClient: client,
      timeout: const Duration(seconds: 5),
    );

    tester.view.physicalSize = const Size(1000, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(api)],
        child: const MaterialApp(home: Scaffold(body: ProveedoresPane())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Distribuidora Norte'), findsOneWidget);
    await tester.tap(find.byKey(const Key('admin_proveedor_prv_1')));
    await tester.pumpAndSettle();

    expect(find.text('Albahaca'), findsOneWidget);
    await tester.enterText(
      find.byKey(const Key('admin_proveedor_nombre')),
      'Norte SRL',
    );
    await tester.tap(find.byKey(const Key('admin_proveedor_guardar')));
    await tester.pumpAndSettle();

    expect(actualizacion.method, 'POST');
    expect(jsonDecode(actualizacion.body)['nombre'], 'Norte SRL');
    expect(lecturas, 2);
    expect(find.text('Norte SRL'), findsWidgets);
  });
}
