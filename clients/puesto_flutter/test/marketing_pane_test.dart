import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/marketing_pane.dart';
import 'package:puesto_flutter/models/creativo.dart';

const _estadoJson = {
  'data': {
    'creditos': 20,
    'costo': 4,
    'textos': 4,
    'piezas': ['banner', 'push'],
    'paquetes': [
      {'id': 'prod_creditos_50', 'creditos': 50, 'usd': 5.99},
    ],
    'pedidos': [
      {
        'id': 'crea_001',
        'formato': 'banner',
        'estado': 'listo',
        'brief': 'Tomate perita de hoy',
        'creditos': 4,
        'createdAt': '2026-10-25T10:30:00Z',
        'variantes': [
          {
            'id': 'var_001',
            'n': 1,
            'titulo': 'Tomate fresco',
            'texto': 'Perita del día, precio de puesto',
            'imagen': 'https://ejemplo.com/img.png',
          },
        ],
      },
    ],
  },
};

const _estadoVacioJson = {
  'data': {
    'creditos': 0,
    'costo': 4,
    'textos': 4,
    'piezas': [],
    'paquetes': [],
    'pedidos': [],
  },
};

class _MockBackend {
  var lecturas = 0;
  var generaciones = 0;
  var envios = 0;
  var borrados = 0;
  String? rechazoGenerar;
  Map<String, dynamic> estadoJson = _estadoJson;

  late final api = ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-admin',
    httpClient: MockClient((request) async {
      final path = request.url.path;
      final method = request.method;

      if (method == 'GET' && path == '/api/v1/creativos') {
        lecturas++;
        return http.Response(
          jsonEncode(estadoJson),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (method == 'POST' && path == '/api/v1/creativos') {
        generaciones++;
        if (rechazoGenerar != null) {
          return http.Response(
            jsonEncode({'message': rechazoGenerar}),
            400,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'crea_nuevo',
              'formato': 'banner',
              'creditos': 4,
              'saldo': 16,
              'variantes': [
                {
                  'id': 'var_nueva',
                  'n': 1,
                  'titulo': 'Nuevo',
                  'texto': 'Texto nuevo',
                  'imagen': 'https://ejemplo.com/nueva.png',
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (method == 'POST' && path == '/api/v1/creativos/crea_001/enviar') {
        envios++;
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (method == 'DELETE' && path == '/api/v1/creativos/crea_001') {
        borrados++;
        return http.Response('{}', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      throw StateError('Request inesperada: $method $path');
    }),
  );
}

Future<void> _abrir(WidgetTester tester, _MockBackend backend) async {
  tester.view.physicalSize = const Size(1200, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(backend.api)],
      child: const MaterialApp(home: Scaffold(body: MarketingPane())),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('carga el estado y muestra saldo + pedidos', (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    expect(backend.lecturas, 1);
    expect(find.text('20'), findsOneWidget); // creditos
    expect(find.text('Tomate perita de hoy'), findsOneWidget); // brief
    expect(find.text('Banner'), findsWidgets); // tipo chip
    expect(find.text('Listo'), findsOneWidget); // estado chip
    expect(find.text('Tomate fresco'), findsOneWidget); // variante titulo
  });

  testWidgets('muestra estado vacío cuando no hay pedidos', (tester) async {
    final backend = _MockBackend();
    backend.estadoJson = _estadoVacioJson;
    await _abrir(tester, backend);

    expect(find.text('No hay creativos.'), findsOneWidget);
    expect(find.text('Sin créditos'), findsOneWidget); // botón deshabilitado
  });

  testWidgets('botón "Nuevo creativo" abre el diálogo de generación',
      (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('marketing_generar')));
    await tester.pumpAndSettle();

    expect(find.text('Nuevo creativo'), findsWidgets);
    expect(find.byKey(const Key('generar_brief')), findsOneWidget);
    expect(find.byKey(const Key('generar_foto')), findsOneWidget);
  });

  testWidgets('generar con brief válido crea el pedido', (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('marketing_generar')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('generar_brief')),
      'Oferta del día: tomate perita',
    );
    await tester.tap(find.byKey(const Key('generar_confirmar')));
    await tester.pumpAndSettle();

    expect(backend.generaciones, 1);
  });

  testWidgets('generar con brief corto muestra error de validación',
      (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('marketing_generar')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('generar_brief')), 'corto');
    await tester.tap(find.byKey(const Key('generar_confirmar')));
    await tester.pumpAndSettle();

    expect(find.text('Contá un poco más, aunque sea una frase.'), findsOneWidget);
    expect(backend.generaciones, 0);
  });

  testWidgets('botón "Enviar" llama al endpoint de envío', (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('creativo_enviar_crea_001')));
    await tester.pumpAndSettle();

    expect(backend.envios, 1);
    expect(find.text('Creativo enviado.'), findsOneWidget);
  });

  testWidgets('botón "Borrar" muestra confirmación y llama al endpoint',
      (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('creativo_borrar_crea_001')));
    await tester.pumpAndSettle();

    expect(find.text('Borrar creativo'), findsOneWidget);
    expect(find.text('Borrar'), findsWidgets); // botón en diálogo

    await tester.tap(find.text('Borrar').last);
    await tester.pumpAndSettle();

    expect(backend.borrados, 1);
    expect(find.text('Creativo borrado.'), findsOneWidget);
  });

  testWidgets('error del backend en generar muestra SnackBar', (tester) async {
    final backend = _MockBackend();
    backend.rechazoGenerar = 'No alcanzan los créditos.';
    await _abrir(tester, backend);

    await tester.tap(find.byKey(const Key('marketing_generar')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('generar_brief')),
      'Oferta del día: tomate perita',
    );
    await tester.tap(find.byKey(const Key('generar_confirmar')));
    await tester.pumpAndSettle();

    expect(find.text('No alcanzan los créditos.'), findsOneWidget);
  });

  testWidgets('filtro por tipo filtra los pedidos', (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);

    // Cambiar filtro a "Push"
    await tester.tap(find.byType(DropdownButtonFormField<TipoCreativo?>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Push').last);
    await tester.pumpAndSettle();

    // El pedido banner no debería aparecer
    expect(find.text('Tomate perita de hoy'), findsNothing);
    expect(find.text('No hay creativos con esos filtros.'), findsOneWidget);
  });

  testWidgets('botón refrescar recarga el estado', (tester) async {
    final backend = _MockBackend();
    await _abrir(tester, backend);
    expect(backend.lecturas, 1);

    await tester.tap(find.byTooltip('Actualizar'));
    await tester.pumpAndSettle();

    expect(backend.lecturas, 2);
  });
}
