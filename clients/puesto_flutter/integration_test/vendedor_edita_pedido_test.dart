import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/core/ids.dart';
import 'package:puesto_flutter/main.dart' as app;

import 'e2e_sesion.dart';

/// El pedido vive en la cola de caja hasta que alguien lo cobra: mientras
/// está en cola el puesto edita sus propios ítems, y el tablero se sondea
/// solo para que cualquiera (vendedor, caja o dueño) vea los nombres moverses
/// de "En cola" a "Para entregar" y de ahí a "Entregados".
///
/// Requiere el backend contra Neon DEV. Windows:
///   flutter test integration_test/vendedor_edita_pedido_test.dart -d windows \
///     --dart-define=API_BASE_URL=http://localhost:8080
const _emailVenta = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'venta@frutasroman.com',
);
const _emailCaja = String.fromEnvironment(
  'E2E_CAJA_EMAIL',
  defaultValue: 'caja@frutasroman.com',
);
const _emailDueno = String.fromEnvironment(
  'E2E_DUENO_EMAIL',
  defaultValue: 'dueno@frutasroman.com',
);
const _password = String.fromEnvironment(
  'E2E_PASSWORD',
  defaultValue: 'roman2026',
);

final _http = http.Client();

Future<String> _signIn(String email) => signInConReintentos(
      _http,
      Uri.parse('${AppConfig.apiBaseUrl}/api/auth/sign-in/email'),
      {'content-type': 'application/json', 'origin': AppConfig.authOrigin},
      jsonEncode({'email': email, 'password': _password}),
      motivo: 'sign-in $email',
    );

Future<Map<String, dynamic>> _getJson(String path, String token) async {
  final res = await _http.get(
    Uri.parse('${AppConfig.apiBaseUrl}$path'),
    headers: {'accept': 'application/json', 'authorization': 'Bearer $token'},
  );
  expect(res.statusCode, 200, reason: 'GET $path: ${res.body}');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

Future<(int, String)> _postJson(
  String path,
  String token, {
  Object? body,
}) async {
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

/// Pedido de fixture con una sola línea de cantidad 1. Devuelve el pedido
/// creado y el producto de esa línea, que es el que la UI va a editar.
Future<(Map<String, dynamic>, String)> _crearPedidoRaw(String token) async {
  final catalogo = await _getJson('/api/v1/catalogo', token);
  final producto = (catalogo['data'] as List)
      .cast<Map<String, dynamic>>()
      .firstWhere((p) => p['activo'] == true);
  final (status, body) = await _postJson('/api/v1/pedidos', token, body: {
    'clientUuid': generarUuidV4(),
    'clienteNombre': 'Mostrador E2E',
    'items': [
      {'productoId': producto['id'], 'cantidad': 1},
    ],
  });
  expect(status, 201, reason: 'POST /pedidos: $body');
  final pedido =
      (jsonDecode(body) as Map<String, dynamic>)['data'] as Map<String, dynamic>;
  return (pedido, producto['id'] as String);
}

Future<void> _cobrarRaw(String tokenCaja, String pedidoId) async {
  final (status, body) = await _postJson(
    '/api/v1/pedidos/$pedidoId/cobrar',
    tokenCaja,
    body: {'clientUuid': generarUuidV4(), 'formaPago': 'efectivo'},
  );
  expect(status, 200, reason: 'POST /cobrar: $body');
}

Future<Map<String, dynamic>> _pedidoRemoto(String token, String id) async =>
    (await _getJson('/api/v1/pedidos/$id', token))['data'] as Map<String, dynamic>;

/// Polling de frames: el tablero sondea y hay barras de progreso, así que
/// `pumpAndSettle` no termina nunca.
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
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return;
  }
  fail('Siguió en pantalla: $finder');
}

/// El tablero arma sus filas dentro de un `ListView`, que sólo construye lo
/// que entra en la ventana: con la cola de DEV llena (60 pedidos por sección),
/// "Para entregar" y sus filas no existen hasta scrollear. Es el mismo
/// recorrido que hace una persona, no un atajo del test.
Future<void> _bajarHasta(WidgetTester tester, Finder finder) async {
  final lista = find.byKey(const Key('pedidos_lista'));
  await _esperar(tester, lista);
  await tester.scrollUntilVisible(
    finder,
    120,
    scrollable: find.descendant(
      of: lista,
      matching: find.byType(Scrollable),
    ).first,
  );
}

/// Login del [email] y navegación al tablero de pedidos del puesto.
Future<void> _loginYIrAPedidos(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tocaLoginHasta(tester, find.byKey(const Key('logout_button')));

  await irASeccion(tester, 'Pedidos');
  await _esperar(tester, find.byKey(const Key('pedidos_lista')));
}

Future<void> _abrirDetalle(WidgetTester tester, String pedidoId) async {
  final tile = find.byKey(Key('pedido_tile_$pedidoId'));
  await _bajarHasta(tester, tile);
  await tester.tap(tile);
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('pedido_detalle')));
}

String _total(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('pedido_detalle_total'))).data!;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('el vendedor edita su pedido mientras espera en la cola', (
    tester,
  ) async {
    final tokenVenta = await _signIn(_emailVenta);
    final (pedido, productoId) = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    final totalInicial = (pedido['total'] as num).toDouble();
    expect(pedido['estado'], 'enviado');
    expect(totalInicial, greaterThan(0), reason: 'el fixture debe tener precio');

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester, _emailVenta);

    // El tablero muestra la cola de caja completa, no sólo lo propio. Se
    // comprueba acá: una vez abierto el detalle, la lista queda tapada.
    expect(find.text('En vivo'), findsOneWidget);
    expect(find.text('EN COLA'), findsOneWidget);

    await _abrirDetalle(tester, id);
    await _esperar(tester, find.byKey(const Key('pedido_editar_items')));
    final antes = _total(tester);

    await tester.tap(find.byKey(const Key('pedido_editar_items')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('items_dialogo')));
    await tester.enterText(find.byKey(Key('items_cantidad_$productoId')), '3');
    await tester.pump();
    await tester.tap(find.byKey(const Key('items_guardar')));
    await _esperar(tester, find.byKey(const Key('items_confirmar')));
    await tester.tap(find.byKey(const Key('items_confirmar_aceptar')));
    await tester.pump();

    await _esperarSin(tester, find.byKey(const Key('items_dialogo')));
    final fin = DateTime.now().add(const Duration(seconds: 30));
    while (_total(tester) == antes && DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 250));
    }

    // El total que se muestra lo recalculó el backend, no el cliente.
    expect(_total(tester), isNot(antes));
    final remoto = await _pedidoRemoto(tokenVenta, id);
    expect((remoto['items'] as List).length, 1);
    expect(
      (((remoto['items'] as List).first as Map)['cantidad'] as num).toDouble(),
      3.0,
    );
    expect(
      (remoto['total'] as num).toDouble(),
      closeTo(totalInicial * 3, 0.01),
    );
    expect(remoto['estado'], 'enviado', reason: 'editar no mueve el pedido');
  });

  testWidgets('un pedido cobrado ya no se edita', (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final (pedido, _) = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    await _cobrarRaw(tokenCaja, id);

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester, _emailVenta);

    // Ya pasó por caja: la lista lo mueve a la sección de entregar.
    final cobrar = find.text('PARA ENTREGAR');
    await _bajarHasta(tester, cobrar);
    expect(cobrar, findsOneWidget);

    await _abrirDetalle(tester, id);
    await _esperar(tester, find.text('Cobrado'));
    expect(find.byKey(const Key('pedido_editar_items')), findsNothing);

    // Y el backend tampoco lo deja: la UI no es la única barrera.
    final (status, body) = await _postJson(
      '/api/v1/pedidos/$id/items',
      tokenVenta,
      body: {
        'items': [
          {'productoId': 'prod_inexistente', 'cantidad': 1},
        ],
      },
    );
    expect(status, 400, reason: body);
    expect(body, contains('Este pedido ya no se puede editar.'));
  });

  testWidgets('la cola se mueve sola: de "En cola" a "Para entregar"', (
    tester,
  ) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final (pedido, _) = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;

    // El dueño mira la misma pantalla: ve el pedido de otro vendedor en vivo.
    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester, _emailDueno);

    final tile = find.byKey(Key('pedido_tile_$id'));
    await _bajarHasta(tester, tile);
    expect(
      find.descendant(of: tile, matching: find.textContaining('Enviado')),
      findsOneWidget,
    );

    await _cobrarRaw(tokenCaja, id);

    // Se fuerza un refresco completo y se espera a que termine: a partir de
    // ahí la lista ya tiene el estado del backend, no el anterior.
    await _esperarSin(tester, find.byKey(const Key('pedidos_refrescando')));
    await tester.tap(find.byKey(const Key('pedidos_refrescar')));
    await _esperar(tester, find.byKey(const Key('pedidos_refrescando')));
    await _esperarSin(tester, find.byKey(const Key('pedidos_refrescando')));

    final entregar = find.text('PARA ENTREGAR');
    await _bajarHasta(tester, entregar);
    expect(entregar, findsOneWidget);
    await _bajarHasta(tester, tile);

    expect(
      find.descendant(of: tile, matching: find.textContaining('Cobrado')),
      findsOneWidget,
      reason: 'el mismo nombre viaja de sección sin recargar la pantalla',
    );
    expect(
      find.descendant(of: tile, matching: find.textContaining('Enviado')),
      findsNothing,
    );
  });
}
