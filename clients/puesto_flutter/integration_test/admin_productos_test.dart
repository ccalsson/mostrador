import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/core/format.dart';
import 'package:puesto_flutter/main.dart' as app;

/// Fase 5.1 — admin de productos/stock/alertas (Windows): alta, alerta de
/// stock bajo, ajuste/merma, edición y baja lógica desde el tablero del
/// Dueño. Sin mocks: backend real + Neon DEV. Deja un producto "TEST E2E …"
/// inactivo en DEV (la baja es lógica a propósito).
///
/// Requiere el backend corriendo en 8080 contra Neon DEV:
///   flutter test integration_test/admin_productos_test.dart -d windows \
///     --dart-define=API_BASE_URL=http://127.0.0.1:8080
const _emailDueno = String.fromEnvironment(
  'E2E_ADMIN_EMAIL',
  defaultValue: 'dueno@frutasroman.com',
);
const _emailVenta = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'venta@frutasroman.com',
);
const _password =
    String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');

final _http = http.Client();

Future<String> _signIn(String email) async {
  final res = await _http.post(
    Uri.parse('${AppConfig.apiBaseUrl}/api/auth/sign-in/email'),
    headers: {
      'content-type': 'application/json',
      'origin': AppConfig.authOrigin,
    },
    body: jsonEncode({'email': email, 'password': _password}),
  );
  expect(res.statusCode, 200, reason: 'sign-in $email: ${res.body}');
  return (jsonDecode(res.body) as Map<String, dynamic>)['token'] as String;
}

Future<Map<String, dynamic>> _getJson(String path, String token) async {
  final res = await _http.get(
    Uri.parse('${AppConfig.apiBaseUrl}$path'),
    headers: {'accept': 'application/json', 'authorization': 'Bearer $token'},
  );
  expect(res.statusCode, 200, reason: 'GET $path: ${res.body}');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

Future<(int, String)> _postJson(String path, String token,
    {Object? body}) async {
  final res = await _http.post(
    Uri.parse('${AppConfig.apiBaseUrl}$path'),
    headers: {
      'accept': 'application/json',
      if (body != null) 'content-type': 'application/json',
      'authorization': 'Bearer $token',
    },
    body: body == null ? null : jsonEncode(body),
  );
  return (res.statusCode, res.body);
}

/// Polling de frames: hay spinners que animan indefinidamente.
Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No apareció en pantalla: $finder');
}

Future<void> _esperarSin(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  String? reason,
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return;
  }
  fail('Sigue en pantalla: $finder${reason == null ? '' : ' ($reason)'}');
}

/// La lista de alertas puede superar el alto de la ventana: desplaza hasta
/// que el tile buscado se construya.
Future<void> _desplazarHasta(WidgetTester tester, Finder finder) async {
  final lista = find.byKey(const Key('alertas_lista'));
  final fin = DateTime.now().add(const Duration(seconds: 30));
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
    await tester.drag(lista, const Offset(0, -300));
    await tester.pump();
  }
  fail('No apareció en la lista: $finder');
}

/// El backend es la fuente de verdad: espera el producto por nombre exacto.
Future<Map<String, dynamic>> _productoRemoto(
  String token,
  String nombre,
) async {
  final fin = DateTime.now().add(const Duration(seconds: 20));
  while (true) {
    final res = await _getJson('/api/v1/catalogo', token);
    final match = (res['data'] as List)
        .cast<Map<String, dynamic>>()
        .where((p) => p['nombre'] == nombre)
        .toList();
    if (match.isNotEmpty) return match.single;
    if (DateTime.now().isAfter(fin)) fail('No apareció "$nombre" en /catalogo');
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
}

Future<Map<String, dynamic>> _alertaRemota(
  String token,
  String fragmento,
) async {
  final fin = DateTime.now().add(const Duration(seconds: 20));
  while (true) {
    final res = await _getJson('/api/v1/alertas', token);
    final match = (res['data'] as List)
        .cast<Map<String, dynamic>>()
        .where((a) => (a['mensaje'] as String).contains(fragmento))
        .toList();
    if (match.isNotEmpty) return match.first;
    if (DateTime.now().isAfter(fin)) {
      fail('No apareció alerta con "$fragmento" en /alertas');
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
}

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  // El admin aterriza en el Dashboard (commit del shell admin).
  await _esperar(tester, find.byKey(const Key('dashboard_lista')));
}

Future<void> _buscarProducto(WidgetTester tester, String nombre, String id) async {
  await tester.enterText(
    find.byKey(const Key('admin_buscar_producto')),
    nombre,
  );
  await tester.pump();
  await _esperar(tester, find.byKey(Key('admin_producto_$id')));
}

/// El menú de secciones es una fila horizontal de píldoras: en pantallas
/// angostas las últimas quedan fuera del viewport. Desplaza el menú hasta la
/// píldora y recién ahí toca.
Future<void> _tocarPildora(WidgetTester tester, String etiqueta) async {
  final pildora = find.text(etiqueta);
  await tester.scrollUntilVisible(
    pildora,
    100,
    scrollable: find
        .byWidgetPredicate(
          (widget) =>
              widget is Scrollable && widget.axisDirection == AxisDirection.right,
        )
        .first,
  );
  await tester.ensureVisible(pildora);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(pildora);
  await tester.pump();
}

String _subtitulo(WidgetTester tester, String id) =>
    ((tester
                .widget<ListTile>(find.byKey(Key('admin_producto_$id')))
                .subtitle!) as Text)
        .data!;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets(
      'alta con stock bajo genera alerta; ajuste, merma, edición y baja',
      (tester) async {
    final tokenDueno = await _signIn(_emailDueno);
    final tokenVenta = await _signIn(_emailVenta);
    final nombre =
        'TEST E2E ${DateTime.now().microsecondsSinceEpoch.remainder(100000000)}';

    // §7 permisos: el backend rechaza el alta del vendedor (sin mock).
    final (statusVenta, bodyVenta) = await _postJson(
      '/api/v1/productos',
      tokenVenta,
      body: {
        'nombre': 'TEST sin permiso',
        'unidad': 'kg',
        'unidadLabel': 'kg',
        'precio': 1,
        'stockMinimo': 0,
        'alias': <String>[],
        'activo': true,
      },
    );
    expect(statusVenta, 403, reason: bodyVenta);
    expect(bodyVenta, contains('No tenés permiso'));

    app.main();
    await tester.pump();
    await _login(tester, _emailDueno);

    // ---- Alta con stock inicial bajo el mínimo ----
    await _tocarPildora(tester, 'Productos');
    await _esperar(tester, find.byKey(const Key('admin_productos_lista')));

    await tester.tap(find.byKey(const Key('admin_nuevo_producto')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_prod_nombre')));
    await tester.enterText(
        find.byKey(const Key('admin_prod_nombre')), nombre);
    await tester.enterText(find.byKey(const Key('admin_prod_precio')), '1250,5');
    await tester.enterText(find.byKey(const Key('admin_prod_minimo')), '10');
    await tester.enterText(find.byKey(const Key('admin_prod_alias')), 'test e2e');
    await tester.enterText(find.byKey(const Key('admin_prod_inicial')), '5');
    await tester.tap(find.byKey(const Key('admin_guardar_producto')));

    // El backend confirma el alta: stock 5 por debajo del mínimo 10.
    final producto = await _productoRemoto(tokenDueno, nombre);
    final id = producto['id'] as String;
    expect((producto['stock'] as num).toDouble(), 5);
    expect((producto['stockMinimo'] as num).toDouble(), 10);
    expect((producto['precio'] as num).toDouble(), 1250.5);
    expect(producto['activo'], true);
    expect(producto['stockBajo'], true);

    await _esperarSin(tester, find.byKey(const Key('admin_prod_nombre')));
    await _buscarProducto(tester, nombre, id);
    final subtitulo = _subtitulo(tester, id);
    expect(subtitulo, contains(moneda(1250.5)));
    expect(subtitulo, contains('Stock: 5'));
    expect(subtitulo, contains('Mín.: 10'));
    expect(find.text('Stock bajo'), findsOneWidget);

    // ---- Alerta de stock bajo y marcar leída ----
    await _tocarPildora(tester, 'Alertas');
    await _esperar(tester, find.byKey(const Key('alertas_lista')));

    final alerta = await _alertaRemota(tokenDueno, nombre);
    final idAlerta = alerta['id'] as String;
    expect(alerta['tipo'], 'stock_bajo');
    await _desplazarHasta(tester, find.byKey(Key('alerta_leer_$idAlerta')));
    await tester.tap(find.byKey(Key('alerta_leer_$idAlerta')));
    await _esperarSin(tester, find.byKey(Key('alerta_leer_$idAlerta')),
        reason: 'tras marcar leída el botón desaparece');

    // ---- Ajuste: sumar 10 y luego merma 2 ----
    await _tocarPildora(tester, 'Productos');
    await _esperar(tester, find.byKey(const Key('admin_productos_lista')));
    await _buscarProducto(tester, nombre, id);

    await tester.tap(find.byKey(Key('admin_ajustar_$id')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_ajuste_cantidad')));
    expect(find.textContaining('Stock actual: 5'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('admin_ajuste_cantidad')), '10');
    await tester.enterText(
        find.byKey(const Key('admin_ajuste_motivo')), 'reposicion e2e');
    await tester.tap(find.byKey(const Key('admin_ajuste_guardar')));
    await _esperarSin(tester, find.byKey(const Key('admin_ajuste_cantidad')));
    await _esperar(tester, find.textContaining('Stock: 15'));

    await tester.tap(find.byKey(Key('admin_ajustar_$id')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_ajuste_cantidad')));
    await tester.tap(find.text('Merma'));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('admin_ajuste_cantidad')), '2');
    await tester.enterText(
        find.byKey(const Key('admin_ajuste_motivo')), 'fruta dañada e2e');
    await tester.tap(find.byKey(const Key('admin_ajuste_guardar')));
    await _esperarSin(tester, find.byKey(const Key('admin_ajuste_cantidad')));
    await _esperar(tester, find.textContaining('Stock: 13'));

    // ---- Edición: precio prellenado y nuevo valor ----
    await tester.tap(find.byKey(Key('admin_producto_$id')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_guardar_producto')));
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('admin_prod_precio')))
          .controller!
          .text,
      cantidadNum(1250.5),
      reason: 'el formulario de edición viene prellenado',
    );
    await tester.enterText(find.byKey(const Key('admin_prod_precio')), '1300');
    await tester.tap(find.byKey(const Key('admin_guardar_producto')));
    await _esperarSin(tester, find.byKey(const Key('admin_guardar_producto')));
    await _esperar(tester, find.textContaining(moneda(1300)));

    // ---- Baja lógica con confirmación ----
    await tester.tap(find.byKey(Key('admin_producto_$id')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_baja_producto')));
    await tester.tap(find.byKey(const Key('admin_baja_producto')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_confirmar_baja')));
    await tester.tap(find.byKey(const Key('admin_confirmar_baja')));
    await _esperarSin(tester, find.byKey(const Key('admin_confirmar_baja')));
    await _esperar(tester, find.text('Inactivo'));

    // Estado final en el backend: la única fuente de verdad.
    final final_ = await _productoRemoto(tokenDueno, nombre);
    expect(final_['activo'], false, reason: 'la baja es lógica');
    expect((final_['stock'] as num).toDouble(), 13);
    expect((final_['precio'] as num).toDouble(), 1300);
    expect(find.text('Stock bajo'), findsNothing,
        reason: 'con stock 13 sobre mínimo 10 ya no hay alerta de stock');
  });
}
