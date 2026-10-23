import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/identidad_pane.dart';

class _MarcaHttp {
  var lecturas = 0;
  final guardados = <Map<String, dynamic>>[];
  String? rechazo;

  late final api = ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-admin',
    httpClient: MockClient((request) async {
      if (request.method == 'GET' && request.url.path == '/api/v1/marca') {
        lecturas++;
        return http.Response(
          jsonEncode({
            'nombre': 'La Esquina',
            'bajada': 'Almacén',
            'membrete': 'Membrete',
            'pie': 'Pie de factura',
            'fondo': '#0F3D26',
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (request.method == 'POST' && request.url.path == '/api/v1/marca') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (rechazo != null) {
          return http.Response(
            jsonEncode({'message': rechazo}),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        guardados.add(body);
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      throw StateError(
        'Request inesperada: ${request.method} ${request.url.path}',
      );
    }),
  );
}

Future<void> _abrir(WidgetTester tester, _MarcaHttp backend) async {
  tester.view.physicalSize = const Size(1200, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(backend.api)],
      child: const MaterialApp(home: Scaffold(body: IdentidadPane())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('carga los cinco campos desde el backend', (tester) async {
    final backend = _MarcaHttp();
    await _abrir(tester, backend);

    expect(find.byKey(const Key('identidad_nombre')), findsOneWidget);
    expect(find.byKey(const Key('identidad_bajada')), findsOneWidget);
    expect(find.byKey(const Key('identidad_membrete')), findsOneWidget);
    expect(find.byKey(const Key('identidad_pie')), findsOneWidget);
    expect(find.byKey(const Key('identidad_fondo')), findsOneWidget);

    final nombreCtrl = (tester.widget<TextFormField>(
      find.byKey(const Key('identidad_nombre')),
    )).controller!;
    expect(nombreCtrl.text, 'La Esquina');

    final fondoCtrl = (tester.widget<TextFormField>(
      find.byKey(const Key('identidad_fondo')),
    )).controller!;
    expect(fondoCtrl.text, '#0F3D26');
  });

  testWidgets('guardar envía POST con los cinco campos editados',
      (tester) async {
    final backend = _MarcaHttp();
    await _abrir(tester, backend);

    await tester.enterText(
      find.byKey(const Key('identidad_nombre')),
      'Nuevo Nombre',
    );
    await tester.enterText(
      find.byKey(const Key('identidad_bajada')),
      'Nueva Bajada',
    );
    await tester.tap(find.byKey(const Key('identidad_guardar')));
    await tester.pumpAndSettle();

    expect(backend.guardados, hasLength(1));
    expect(backend.guardados.single['nombre'], 'Nuevo Nombre');
    expect(backend.guardados.single['bajada'], 'Nueva Bajada');
    expect(backend.guardados.single['membrete'], 'Membrete');
    expect(backend.guardados.single['pie'], 'Pie de factura');
    expect(backend.guardados.single['fondo'], '#0F3D26');
    expect(find.text('Identidad guardada.'), findsOneWidget);
  });

  testWidgets('muestra SnackBar con error cuando el backend rechaza',
      (tester) async {
    final backend = _MarcaHttp();
    backend.rechazo = 'Sin permiso para editar marca.';
    await _abrir(tester, backend);

    await tester.enterText(
      find.byKey(const Key('identidad_nombre')),
      'Cambio',
    );
    await tester.tap(find.byKey(const Key('identidad_guardar')));
    await tester.pumpAndSettle();

    expect(find.text('Sin permiso para editar marca.'), findsOneWidget);
    expect(backend.guardados, isEmpty);
  });

  testWidgets('botón refrescar recarga la marca desde el backend',
      (tester) async {
    final backend = _MarcaHttp();
    await _abrir(tester, backend);
    expect(backend.lecturas, 1);

    await tester.tap(find.byTooltip('Actualizar'));
    await tester.pumpAndSettle();

    expect(backend.lecturas, 2);
  });
}
