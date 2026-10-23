import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/usuarios_pane.dart';

void main() {
  late List<http.Request> requests;
  late MockClient httpClient;

  setUp(() {
    requests = [];
    httpClient = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET' && request.url.path == '/api/v1/usuarios') {
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'u_1',
                'nombre': 'Ana Pérez',
                'email': 'ana@test.com',
                'rol': 'vendedor',
                'activo': true,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (request.method == 'POST' &&
          request.url.path == '/api/v1/usuarios/u_1/clave') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        final password = body['password'] as String? ?? '';
        if (password.length < 8) {
          return http.Response(
            jsonEncode({
              'error': 'invalid_request',
              'message': 'La contraseña necesita al menos 8 caracteres.',
            }),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({'data': {'ok': true}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response('', 404);
    });
  });

  Future<void> abrirPane(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1280, 900);
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
        child: const MaterialApp(home: Scaffold(body: UsuariosPane())),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('abre el diálogo de cambiar clave al tocar el ícono', (tester) async {
    await abrirPane(tester);
    await tester.tap(find.byKey(const Key('admin_usuario_clave_u_1')));
    await tester.pumpAndSettle();

    expect(find.text('Cambiar contraseña'), findsOneWidget);
    expect(find.byKey(const Key('cambiar_clave_input')), findsOneWidget);
    expect(find.byKey(const Key('cambiar_clave_confirmar')), findsOneWidget);
  });

  testWidgets('valida mínimo 8 caracteres en la contraseña nueva', (tester) async {
    await abrirPane(tester);
    await tester.tap(find.byKey(const Key('admin_usuario_clave_u_1')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('cambiar_clave_input')),
      'corta',
    );
    await tester.enterText(
      find.byKey(const Key('cambiar_clave_confirmar')),
      'corta',
    );
    await tester.tap(find.byKey(const Key('cambiar_clave_guardar')));
    await tester.pumpAndSettle();

    expect(find.text('La contraseña debe tener al menos 8 caracteres'), findsOneWidget);
    // No se debería haber llamado al endpoint
    expect(
      requests.where((r) => r.url.path.contains('/clave')),
      isEmpty,
    );
  });

  testWidgets('valida que las contraseñas coincidan', (tester) async {
    await abrirPane(tester);
    await tester.tap(find.byKey(const Key('admin_usuario_clave_u_1')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('cambiar_clave_input')),
      'password123',
    );
    await tester.enterText(
      find.byKey(const Key('cambiar_clave_confirmar')),
      'password456',
    );
    await tester.tap(find.byKey(const Key('cambiar_clave_guardar')));
    await tester.pumpAndSettle();

    expect(find.text('Las contraseñas no coinciden'), findsOneWidget);
    expect(
      requests.where((r) => r.url.path.contains('/clave')),
      isEmpty,
    );
  });

  testWidgets('envía POST /usuarios/{id}/clave con éxito y muestra SnackBar',
      (tester) async {
    await abrirPane(tester);
    await tester.tap(find.byKey(const Key('admin_usuario_clave_u_1')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('cambiar_clave_input')),
      'nuevaClave123',
    );
    await tester.enterText(
      find.byKey(const Key('cambiar_clave_confirmar')),
      'nuevaClave123',
    );
    await tester.tap(find.byKey(const Key('cambiar_clave_guardar')));
    await tester.pumpAndSettle();

    final claveRequest = requests.singleWhere(
      (r) => r.method == 'POST' && r.url.path == '/api/v1/usuarios/u_1/clave',
    );
    expect(jsonDecode(claveRequest.body), {'password': 'nuevaClave123'});
    expect(find.text('Contraseña actualizada'), findsOneWidget);
  });
}
