import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/core/ids.dart';
import 'package:puesto_flutter/main.dart' as app;

/// Fase 3.2 — vendedor: listado (`mine=1`), detalle, entrega confirmada y
/// protección contra doble acción. Las fixtures se arman por HTTP crudo
/// (sign-in + pedido + cobro como cajero) para no tocar el secure storage
/// de la app, que el flujo de UI necesita limpio para el login.
///
/// Requiere el backend contra Neon DEV. Android:
///   flutter test integration_test/vendedor_seguimiento_test.dart -d emulator-5554 \
///     --dart-define=API_BASE_URL=http://10.0.2.2:8080
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
const _password = String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');

final _http = http.Client();

/// Sign-in de Better Auth para fixtures; exige `Origin` (trusted origin).
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

Future<(int, String)> _postJson(String path, String token, {Object? body}) async {
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

/// Pedido de fixture creado como el vendedor, con `clientUuid` nuevo.
Future<Map<String, dynamic>> _crearPedidoRaw(String tokenVenta) async {
  final catalogo = await _getJson('/api/v1/catalogo', tokenVenta);
  final producto = (catalogo['data'] as List)
      .cast<Map<String, dynamic>>()
      .firstWhere((p) => p['activo'] == true);
  final (status, body) = await _postJson('/api/v1/pedidos', tokenVenta, body: {
    'clientUuid': generarUuidV4(),
    'clienteNombre': 'Mostrador E2E',
    'items': [
      {'productoId': producto['id'], 'cantidad': 1},
    ],
  });
  expect(status, 201, reason: 'POST /pedidos: $body');
  return (jsonDecode(body) as Map<String, dynamic>)['data'] as Map<String, dynamic>;
}

/// Deja el pedido en `cobrado` (el cobro como cajero no exige caja abierta).
Future<void> _cobrarRaw(String tokenCaja, String pedidoId) async {
  final (status, body) = await _postJson(
    '/api/v1/pedidos/$pedidoId/cobrar',
    tokenCaja,
    body: {'clientUuid': generarUuidV4(), 'formaPago': 'efectivo'},
  );
  expect(status, 200, reason: 'POST /cobrar: $body');
}

Future<String> _estadoRemoto(String token, String pedidoId) async {
  final detalle = await _getJson('/api/v1/pedidos/$pedidoId', token);
  return (detalle['data'] as Map<String, dynamic>)['estado'] as String;
}

/// Eventos `entregar` de auditoría para un pedido (requiere rol admin).
Future<int> _entregasAuditadas(String tokenDueno, String pedidoId) async {
  final auditoria = await _getJson('/api/v1/auditoria', tokenDueno);
  var total = 0;
  for (final entrada in (auditoria['data'] as List).cast<Map<String, dynamic>>()) {
    if (entrada['accion'] != 'entregar') continue;
    final detalle = entrada['detalle'];
    final mapa = detalle is String ? jsonDecode(detalle) : detalle;
    if (mapa is Map && mapa['id'] == pedidoId) total++;
  }
  return total;
}

/// Polling de frames: `pumpAndSettle` no sirve porque hay spinners que animan
/// indefinidamente (CircularProgressIndicator, refrescos).
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

/// Espera a que [finder] desaparezca (p. ej. la barra de refresco).
Future<void> _esperarSin(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isEmpty) return;
  }
  fail('Siguió en pantalla: $finder');
}

/// Espera a que el estado visible del detalle sea [esperado] (label del modelo).
Future<void> _esperarEstado(
  WidgetTester tester,
  String esperado, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final finder = find.byKey(const Key('pedido_detalle_estado'));
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty &&
        tester.widget<Text>(finder).data == esperado) {
      return;
    }
  }
  final visto =
      finder.evaluate().isEmpty ? '(ausente)' : tester.widget<Text>(finder).data;
  fail('pedido_detalle_estado nunca mostró "$esperado"; quedó en "$visto"');
}

/// Login del vendedor y navegación al listado de pedidos.
Future<void> _loginYIrAPedidos(WidgetTester tester) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), _emailVenta);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('catalogo_lista')));

  await tester.tap(find.text('Pedidos'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('pedidos_lista')));
}

Future<void> _abrirDetalle(WidgetTester tester, String pedidoId) async {
  final tile = find.byKey(Key('pedido_tile_$pedidoId'));
  await _esperar(tester, tile);
  await tester.tap(tile);
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('pedido_detalle')));
}

/// Toca "Entregar pedido" y confirma en el diálogo.
Future<void> _confirmarEntrega(WidgetTester tester) async {
  await _esperar(tester, find.byKey(const Key('pedido_entregar')));
  await tester.tap(find.byKey(const Key('pedido_entregar')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('entrega_confirmar')));
  await tester.tap(find.byKey(const Key('entrega_confirmar')));
  await tester.pump();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('listado: muestra el pedido del vendedor y abre el detalle',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    expect(pedido['estado'], 'enviado');

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester);

    final tile = find.byKey(Key('pedido_tile_$id'));
    await _esperar(tester, tile);
    expect(
      find.descendant(of: tile, matching: find.textContaining('Enviado')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: tile, matching: find.textContaining(r'$')),
      findsOneWidget,
      reason: 'el tile muestra el total',
    );

    await tester.tap(tile);
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('pedido_detalle')));
    expect(
      tester.widget<Text>(find.byKey(const Key('pedido_detalle_id'))).data,
      'Nº $id',
    );
    await _esperarEstado(tester, 'Enviado');
  });

  testWidgets('entrega: confirmación explícita y estado releído del backend',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    await _cobrarRaw(tokenCaja, id);
    expect(await _estadoRemoto(tokenVenta, id), 'cobrado');

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester);
    await _abrirDetalle(tester, id);
    await _esperarEstado(tester, 'Cobrado');

    await _confirmarEntrega(tester);
    await _esperarEstado(tester, 'Entregado');
    expect(find.byKey(const Key('entrega_error')), findsNothing);
    expect(
      find.byKey(const Key('pedido_entregar')),
      findsNothing,
      reason: 'un pedido entregado ya no ofrece el botón',
    );

    // El dato mostrado proviene del backend, no de una mutación optimista.
    expect(await _estadoRemoto(tokenVenta, id), 'entregado');
  });

  testWidgets('doble acción: un doble tap produce una sola entrega',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final tokenDueno = await _signIn(_emailDueno);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    await _cobrarRaw(tokenCaja, id);

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester);
    await _abrirDetalle(tester, id);
    await _esperarEstado(tester, 'Cobrado');

    await _esperar(tester, find.byKey(const Key('pedido_entregar')));
    await tester.tap(find.byKey(const Key('pedido_entregar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('entrega_confirmar')));
    await tester.tap(find.byKey(const Key('entrega_confirmar')));
    // Segundo tap inmediato, sin dejar cerrar el diálogo.
    await tester.tap(
      find.byKey(const Key('entrega_confirmar')),
      warnIfMissed: false,
    );
    await tester.pump();

    await _esperarEstado(tester, 'Entregado');
    expect(find.byKey(const Key('entrega_error')), findsNothing);
    expect(
      await _entregasAuditadas(tokenDueno, id),
      1,
      reason: 'un solo POST de entrega debe llegar al backend',
    );

    // El endpoint no es idempotente: repetir una entrega responde 400.
    final (statusRepeticion, bodyRepeticion) =
        await _postJson('/api/v1/pedidos/$id/entregar', tokenVenta);
    expect(statusRepeticion, 400, reason: bodyRepeticion);
    expect(bodyRepeticion, contains('Solo se entrega un pedido ya cobrado.'));
  });

  testWidgets('estado no entregable: sin botón y el backend rechaza',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;

    app.main();
    await tester.pump();
    await _loginYIrAPedidos(tester);
    await _abrirDetalle(tester, id);
    await _esperarEstado(tester, 'Enviado');
    expect(find.byKey(const Key('pedido_entregar')), findsNothing);

    // Refrescar no habilita la entrega: el estado sigue siendo no entregable.
    await tester.tap(find.byKey(const Key('pedido_detalle_refrescar')));
    await tester.pump();
    await _esperarSin(tester, find.byKey(const Key('pedido_detalle_refrescando')));
    await _esperarEstado(tester, 'Enviado');
    expect(find.byKey(const Key('pedido_entregar')), findsNothing);

    // El backend rechaza la entrega fuera del contrato.
    final (status, body) =
        await _postJson('/api/v1/pedidos/$id/entregar', tokenVenta);
    expect(status, 400,
        reason: 'el contrato sólo permite entregar un pedido cobrado: $body');
    expect(body, contains('Solo se entrega un pedido ya cobrado.'));
  });
}
