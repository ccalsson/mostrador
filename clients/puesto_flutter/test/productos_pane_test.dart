import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/productos_pane.dart';

class _CatalogoHttp {
  final guardados = <Map<String, dynamic>>[];
  var lecturas = 0;
  var bajas = 0;
  bool publicado = true;
  String? rechazo;

  late final api = ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'tok-1',
    httpClient: MockClient((request) async {
      if (request.method == 'GET' && request.url.path == '/api/v1/catalogo') {
        lecturas++;
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'p_1',
                'nombre': 'Manzana',
                'unidad': 'bulto',
                'unidadLabel': 'cajón',
                'precio': 2000,
                'stock': 10,
                'stockMinimo': 2,
                'activo': true,
                'publicadoOnline': publicado,
              },
              {
                'id': 'p_2',
                'nombre': 'Pera',
                'unidad': 'kg',
                'unidadLabel': 'kg',
                'precio': 1000,
                'stock': 10,
                'stockMinimo': 2,
                'activo': true,
                'publicadoOnline': false,
              },
            ],
            'version': 'v$lecturas',
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      if (request.method == 'POST' && request.url.path == '/api/v1/productos') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        guardados.add(body);
        if (rechazo != null) {
          return http.Response(
            jsonEncode({'message': rechazo}),
            403,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        publicado = body['publicadoOnline'] as bool;
        return http.Response('{"data":{"id":"p_1"}}', 200);
      }
      if (request.method == 'POST' && request.url.path.endsWith('/baja')) {
        bajas++;
        return http.Response('{"data":{"ok":true}}', 200);
      }
      throw StateError(
        'Request inesperada: ${request.method} ${request.url.path}',
      );
    }),
  );
}

Future<void> _abrir(
  WidgetTester tester,
  _CatalogoHttp backend,
  Size size,
) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(backend.api)],
      child: const MaterialApp(home: Scaffold(body: ProductosPane())),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('admin_producto_p_1')), findsOneWidget);
}

Future<void> _tocar(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  for (final escritorio in [true, false]) {
    final superficie = escritorio ? 'escritorio' : 'teléfono';
    final size = escritorio ? const Size(1200, 1000) : const Size(390, 844);
    final publicadoKey = escritorio
        ? 'admin_producto_publicado'
        : 'admin_prod_publicado';
    final guardarKey = escritorio
        ? 'admin_producto_guardar'
        : 'admin_guardar_producto';

    testWidgets('$superficie: despublica, relee y vuelve a publicar', (
      tester,
    ) async {
      final backend = _CatalogoHttp();
      await _abrir(tester, backend, size);
      await _tocar(tester, 'admin_producto_p_1');
      expect(
        tester.widget<SwitchListTile>(find.byKey(Key(publicadoKey))).value,
        isTrue,
      );
      await _tocar(tester, publicadoKey);
      await _tocar(tester, guardarKey);
      expect(backend.guardados.single['publicadoOnline'], isFalse);
      expect(backend.guardados.single['unidad'], 'bulto');
      expect(backend.lecturas, 2);
      expect(backend.bajas, 0);
      await _tocar(tester, 'admin_producto_p_1');
      expect(
        tester.widget<SwitchListTile>(find.byKey(Key(publicadoKey))).value,
        isFalse,
      );
      await _tocar(tester, publicadoKey);
      await _tocar(tester, guardarKey);
      expect(backend.guardados.last['publicadoOnline'], isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$superficie: editar nombre conserva publicación', (
      tester,
    ) async {
      final backend = _CatalogoHttp();
      await _abrir(tester, backend, size);
      await _tocar(tester, 'admin_producto_p_1');
      await tester.enterText(
        find.byKey(
          Key(escritorio ? 'admin_producto_nombre' : 'admin_prod_nombre'),
        ),
        'Manzana roja',
      );
      await _tocar(tester, guardarKey);
      expect(backend.guardados.single['publicadoOnline'], isTrue);
      expect(backend.guardados.single['nombre'], 'Manzana roja');
    });

    testWidgets('$superficie: alta empieza sin publicar y envía elección', (
      tester,
    ) async {
      final backend = _CatalogoHttp();
      await _abrir(tester, backend, size);
      await _tocar(tester, 'admin_nuevo_producto');
      expect(
        tester.widget<SwitchListTile>(find.byKey(Key(publicadoKey))).value,
        isFalse,
      );
      final prefix = escritorio ? 'admin_producto' : 'admin_prod';
      await tester.enterText(find.byKey(Key('${prefix}_nombre')), 'Naranja');
      await tester.enterText(find.byKey(Key('${prefix}_precio')), '1500');
      await tester.enterText(find.byKey(Key('${prefix}_minimo')), '0');
      await _tocar(tester, publicadoKey);
      await _tocar(tester, guardarKey);
      expect(backend.guardados.single.containsKey('id'), isFalse);
      expect(backend.guardados.single['publicadoOnline'], isTrue);
      if (escritorio) {
        expect(
          tester.widget<SwitchListTile>(find.byKey(Key(publicadoKey))).value,
          isFalse,
        );
      } else {
        expect(find.byType(AlertDialog), findsNothing);
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('$superficie: muestra rechazo del plan sin anunciar éxito', (
      tester,
    ) async {
      final backend = _CatalogoHttp()
        ..publicado = false
        ..rechazo = 'Sin Presencia o Pro no se publica en Mercado.';
      await _abrir(tester, backend, size);
      await _tocar(tester, 'admin_producto_p_1');
      await _tocar(tester, publicadoKey);
      await _tocar(tester, guardarKey);
      expect(find.text(backend.rechazo!), findsOneWidget);
      expect(find.text('Producto actualizado.'), findsNothing);
      expect(backend.lecturas, 1);
      expect(backend.publicado, isFalse);
      expect(find.byKey(Key(guardarKey)), findsOneWidget);
    });

    testWidgets('$superficie: cancelar no guarda ni da de baja', (
      tester,
    ) async {
      final backend = _CatalogoHttp();
      await _abrir(tester, backend, size);
      await _tocar(tester, 'admin_producto_p_1');
      await _tocar(tester, publicadoKey);
      final cancelar = find.widgetWithText(TextButton, 'Cancelar');
      await tester.ensureVisible(cancelar);
      await tester.tap(cancelar);
      await tester.pumpAndSettle();
      expect(backend.guardados, isEmpty);
      expect(backend.bajas, 0);
      expect(find.byKey(Key(publicadoKey)), findsNothing);
      expect(find.byType(AlertDialog), findsNothing);
    });
  }

  testWidgets(
    'selección desktop cambia unidad y publicación sin arrastrar estado',
    (tester) async {
      final backend = _CatalogoHttp();
      await _abrir(tester, backend, const Size(1200, 1000));
      await _tocar(tester, 'admin_producto_p_1');
      await _tocar(tester, 'admin_producto_p_2');
      final field = tester.state<FormFieldState<String>>(
        find.byKey(const Key('admin_producto_unidad')),
      );
      expect(field.value, 'kg');
      expect(
        tester
            .widget<SwitchListTile>(
              find.byKey(const Key('admin_producto_publicado')),
            )
            .value,
        isFalse,
      );
      await _tocar(tester, 'admin_producto_guardar');
      expect(backend.guardados.single['id'], 'p_2');
      expect(backend.guardados.single['unidad'], 'kg');
    },
  );
}
