import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/caja/egresos_pane.dart';

/// Pantalla mínima con el botón que abre el diálogo de alta.
class _PantallaPrueba extends StatelessWidget {
  const _PantallaPrueba();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => mostrarDialogoNuevoEgreso(ctx),
              child: const Text('Nuevo egreso'),
            ),
          ),
        ),
      ),
    );
  }
}

void main() {
  Future<void> montar(WidgetTester tester, http.Client httpCliente) async {
    // El diálogo mide 360px de ancho y cuatro campos: sin esta superficie
    // desborda y el test falla por layout, no por lógica.
    tester.view.physicalSize = const Size(1200, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            ApiClient(
              baseUrl: 'http://api.test',
              tokenProvider: () async => 'tok-1',
              httpClient: httpCliente,
              timeout: const Duration(seconds: 5),
            ),
          ),
        ],
        child: const _PantallaPrueba(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Nuevo egreso'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('egreso_concepto')),
      'Alquiler',
    );
    await tester.enterText(find.byKey(const Key('egreso_monto')), '45000');
  }

  testWidgets('el reintento del mismo diálogo reenvía el mismo clientUuid',
      (tester) async {
    final clientUuids = <String?>[];
    var fallosRestantes = 1;
    final httpCliente = MockClient((request) async {
      if (request.method == 'POST' && request.url.path == '/api/v1/egresos') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        clientUuids.add(body['clientUuid'] as String?);
        if (fallosRestantes > 0) {
          fallosRestantes--;
          return http.Response(
            jsonEncode({'error': 'boom', 'message': 'sin respuesta'}),
            500,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'data': {'id': 'egr_1', 'ok': true, 'duplicado': false},
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      throw StateError(
        'Request inesperada: ${request.method} ${request.url.path}',
      );
    });

    await montar(tester, httpCliente);
    await tester.tap(find.byKey(const Key('egreso_guardar')));
    await tester.pumpAndSettle();

    expect(clientUuids, hasLength(1));
    expect(clientUuids.single, isNotNull);
    expect(find.text('sin respuesta'), findsOneWidget);
    expect(
      find.byKey(const Key('egreso_guardar')),
      findsOneWidget,
      reason: 'el diálogo queda abierto para reintentar sin retipear',
    );

    await tester.tap(find.byKey(const Key('egreso_guardar')));
    await tester.pumpAndSettle();

    expect(clientUuids, hasLength(2));
    expect(clientUuids[1], clientUuids[0]);
    expect(find.byKey(const Key('egreso_guardar')), findsNothing);
    expect(find.text('Egreso registrado.'), findsOneWidget);
  });

  testWidgets('el monto inválido no dispara el alta', (tester) async {
    var llamadas = 0;
    final httpCliente = MockClient((request) async {
      llamadas++;
      return http.Response(
        jsonEncode({
          'data': {'id': 'egr_1', 'ok': true},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    await montar(tester, httpCliente);
    await tester.enterText(find.byKey(const Key('egreso_monto')), 'abc');
    await tester.tap(find.byKey(const Key('egreso_guardar')));
    await tester.pumpAndSettle();

    expect(llamadas, 0);
    expect(find.text('Monto inválido.'), findsOneWidget);
    expect(find.byKey(const Key('egreso_guardar')), findsOneWidget);
  });
}
