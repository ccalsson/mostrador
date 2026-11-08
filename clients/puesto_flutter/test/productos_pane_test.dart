import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/admin/productos_pane.dart';

const _escritorio = Size(1200, 1000);
const _telefono = Size(390, 844);

http.Response _json(Object body, [int status = 200]) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

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
      final path = request.url.path;
      if (request.method == 'GET' && path == '/api/v1/catalogo') {
        lecturas++;
        return _json({
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
        });
      }
      if (request.method == 'GET' && path == '/api/v1/reportes/productos') {
        return _json({
          'data': {
            'semana': [
              {
                'productoId': 'p_1',
                'nombre': 'Manzana',
                'cantidad': 4,
                'total': 8000,
              },
            ],
            'mes': [
              {
                'productoId': 'p_1',
                'nombre': 'Manzana',
                'cantidad': 12,
                'total': 24000,
              },
            ],
          },
        });
      }
      if (request.method == 'GET' && path.endsWith('/historial')) {
        return _json({
          'data': {
            'dias': [
              {'dia': '2026-10-01', 'cantidad': 2, 'total': 4000},
            ],
          },
        });
      }
      if (request.method == 'POST' && path == '/api/v1/productos') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        guardados.add(body);
        if (rechazo != null) {
          return _json({'message': rechazo}, 403);
        }
        publicado = body['publicadoOnline'] as bool;
        return _json({'data': {'id': 'p_1'}});
      }
      if (request.method == 'POST' && path.endsWith('/baja')) {
        bajas++;
        return _json({'data': {'ok': true}});
      }
      throw StateError('Request inesperada: ${request.method} $path');
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
      child: MaterialApp(
        theme: temaClaro(),
        home: const Scaffold(body: ProductosPane()),
      ),
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
  testWidgets('despublica, relee y vuelve a publicar', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _escritorio);
    await _tocar(tester, 'admin_editar_p_1');
    expect(
      tester.widget<SwitchListTile>(find.byKey(const Key('admin_prod_publicado'))).value,
      isTrue,
    );
    await _tocar(tester, 'admin_prod_publicado');
    await _tocar(tester, 'admin_guardar_producto');
    expect(backend.guardados.single['publicadoOnline'], isFalse);
    expect(backend.guardados.single['unidad'], 'bulto');
    expect(backend.lecturas, 2);
    expect(backend.bajas, 0);
    await _tocar(tester, 'admin_editar_p_1');
    expect(
      tester.widget<SwitchListTile>(find.byKey(const Key('admin_prod_publicado'))).value,
      isFalse,
    );
    await _tocar(tester, 'admin_prod_publicado');
    await _tocar(tester, 'admin_guardar_producto');
    expect(backend.guardados.last['publicadoOnline'], isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('editar nombre conserva publicación', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _escritorio);
    await _tocar(tester, 'admin_editar_p_1');
    await tester.enterText(
      find.byKey(const Key('admin_prod_nombre')),
      'Manzana roja',
    );
    await _tocar(tester, 'admin_guardar_producto');
    expect(backend.guardados.single['publicadoOnline'], isTrue);
    expect(backend.guardados.single['nombre'], 'Manzana roja');
  });

  testWidgets('alta empieza sin publicar y envía elección', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _escritorio);
    await _tocar(tester, 'admin_nuevo_producto');
    expect(
      tester.widget<SwitchListTile>(find.byKey(const Key('admin_prod_publicado'))).value,
      isFalse,
    );
    await tester.enterText(find.byKey(const Key('admin_prod_nombre')), 'Naranja');
    await tester.enterText(find.byKey(const Key('admin_prod_precio')), '1500');
    await tester.enterText(find.byKey(const Key('admin_prod_minimo')), '0');
    await _tocar(tester, 'admin_prod_publicado');
    await _tocar(tester, 'admin_guardar_producto');
    expect(backend.guardados.single.containsKey('id'), isFalse);
    expect(backend.guardados.single['publicadoOnline'], isTrue);
    expect(find.byType(AlertDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('muestra rechazo del plan sin anunciar éxito', (tester) async {
    final backend = _CatalogoHttp()
      ..publicado = false
      ..rechazo = 'Sin Presencia o Pro no se publica en Mercado.';
    await _abrir(tester, backend, _escritorio);
    await _tocar(tester, 'admin_editar_p_1');
    await _tocar(tester, 'admin_prod_publicado');
    await _tocar(tester, 'admin_guardar_producto');
    expect(find.text(backend.rechazo!), findsOneWidget);
    expect(find.text('Producto actualizado.'), findsNothing);
    expect(backend.lecturas, 1);
    expect(backend.publicado, isFalse);
    expect(find.byKey(const Key('admin_guardar_producto')), findsOneWidget);
  });

  testWidgets('cancelar no guarda ni da de baja', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _escritorio);
    await _tocar(tester, 'admin_editar_p_1');
    await _tocar(tester, 'admin_prod_publicado');
    final cancelar = find.widgetWithText(TextButton, 'Cancelar');
    await tester.ensureVisible(cancelar);
    await tester.tap(cancelar);
    await tester.pumpAndSettle();
    expect(backend.guardados, isEmpty);
    expect(backend.bajas, 0);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('escritorio: elegir producto muestra su historial', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _escritorio);
    expect(find.text('Todavía no elegiste ninguno.'), findsOneWidget);

    await _tocar(tester, 'admin_producto_p_1');
    expect(find.text('Ventas · Manzana'), findsOneWidget);
    expect(find.byKey(const Key('admin_producto_historial')), findsOneWidget);

    await _tocar(tester, 'admin_producto_p_2');
    expect(find.text('Ventas · Pera'), findsOneWidget);
    expect(find.text('Ventas · Manzana'), findsNothing);

    // El diálogo de edición arranca con los datos del producto elegido.
    await _tocar(tester, 'admin_editar_p_2');
    final unidad = tester.state<FormFieldState<String>>(
      find.byKey(const Key('admin_prod_unidad')),
    );
    expect(unidad.value, 'kg');
    expect(
      tester.widget<SwitchListTile>(find.byKey(const Key('admin_prod_publicado'))).value,
      isFalse,
    );
    await _tocar(tester, 'admin_guardar_producto');
    expect(backend.guardados.single['id'], 'p_2');
    expect(backend.guardados.single['unidad'], 'kg');
    expect(tester.takeException(), isNull);
  });

  testWidgets('teléfono: fila compacta con stock y edición por diálogo', (tester) async {
    final backend = _CatalogoHttp();
    await _abrir(tester, backend, _telefono);
    final fila = find.byKey(const Key('admin_producto_p_1'));
    expect(
      find.descendant(of: fila, matching: find.text('10 cajón')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila, matching: find.text('\$2000,00')),
      findsOneWidget,
    );
    await _tocar(tester, 'admin_editar_p_1');
    expect(find.byKey(const Key('admin_prod_nombre')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
