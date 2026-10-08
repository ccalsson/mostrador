import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/core/format.dart';
import 'package:puesto_flutter/core/ids.dart';
import 'package:puesto_flutter/main.dart' as app;

/// Fase 4.2.2 — cierre de caja (Windows): el diálogo envía el total contado a
/// `POST /api/v1/caja/cerrar`; el backend recalcula el esperado, cierra el
/// turno, alerta si hay diferencia y abre un turno nuevo que la vista muestra
/// tras "Listo". Sin mocks: backend real + Neon DEV.
///
/// Requiere el backend corriendo en 8080 contra Neon DEV:
///   flutter test integration_test/caja_cierre_test.dart -d windows
const _emailVenta = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'venta@frutasroman.com',
);
const _emailCaja = String.fromEnvironment(
  'E2E_CAJA_EMAIL',
  defaultValue: 'caja@frutasroman.com',
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

/// Cobra el pedido como cajero para que el turno tenga contenido.
Future<void> _cobrarRaw(String tokenCaja, String pedidoId) async {
  final (status, body) = await _postJson(
    '/api/v1/pedidos/$pedidoId/cobrar',
    tokenCaja,
    body: {'clientUuid': generarUuidV4(), 'formaPago': 'efectivo'},
  );
  expect(status, 200, reason: 'POST /cobrar: $body');
}

/// Estado real del turno, tal cual lo consume la UI.
Future<Map<String, dynamic>> _estadoRemoto(String token) async =>
    (await _getJson('/api/v1/caja', token))['data'] as Map<String, dynamic>;

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

/// Login del cajero, navegación a Caja y cambio a la vista de estado.
Future<void> _loginYIrAEstadoDeCaja(WidgetTester tester) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), _emailCaja);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('catalogo_lista')));

  // El chip de rol del header también dice "Caja": la píldora se acota al
  // menú horizontal de secciones.
  await tester.tap(find.descendant(
    of: find.byWidgetPredicate(
        (widget) => widget is ListView && widget.scrollDirection == Axis.horizontal),
    matching: find.text('Caja'),
  ));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_lista')));

  await tester.tap(find.text('Estado de caja'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_estado_contenido')));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('cierre con diferencia cero: turno nuevo visible tras Listo',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);

    // Fixture: al menos un cobro para que el turno tenga contenido.
    final pedido = await _crearPedidoRaw(tokenVenta);
    await _cobrarRaw(tokenCaja, pedido['id'] as String);
    final turnoViejo = await _estadoRemoto(tokenCaja);

    app.main();
    await tester.pump();
    await _loginYIrAEstadoDeCaja(tester);

    await tester.tap(find.byKey(const Key('caja_cerrar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('cierre_dialogo')));
    expect(
      tester.widget<Text>(find.byKey(const Key('cierre_esperado'))).data,
      'Esperado en caja: ${moneda((turnoViejo['esperado'] as num).toDouble())}',
      reason: 'el esperado mostrado es el real del backend',
    );
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('cierre_contado')))
          .controller!
          .text,
      (turnoViejo['esperado'] as num).toDouble().toStringAsFixed(2),
      reason: 'el contado viene prellenado con el esperado',
    );

    await tester.tap(find.byKey(const Key('cierre_confirmar')));
    await _esperar(tester, find.byKey(const Key('cierre_resultado')));
    expect(find.text('Diferencia: \$0,00'), findsOneWidget);
    expect(find.byKey(const Key('cierre_resultado_alerta')), findsNothing);

    await tester.tap(find.byKey(const Key('cierre_listo')));
    await _esperar(tester, find.text('Esperado en caja: \$0,00'));

    // El turno nuevo existe del lado del backend, no es un estado local.
    final turnoNuevo = await _estadoRemoto(tokenCaja);
    expect(turnoNuevo['id'], isNot(turnoViejo['id']),
        reason: 'el backend cerró el turno y abrió uno nuevo');
    expect((turnoNuevo['esperado'] as num).toDouble(), 0,
        reason: 'un turno recién abierto no tiene cobros');
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_estado_id'))).data,
      'Caja: ${turnoNuevo['id']}',
      reason: 'la vista muestra el turno nuevo, no el cerrado',
    );
  });

  testWidgets(
      'cierre con diferencia: destacada, aviso de alerta y turno nuevo',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);

    final pedido = await _crearPedidoRaw(tokenVenta);
    await _cobrarRaw(tokenCaja, pedido['id'] as String);
    final turnoViejo = await _estadoRemoto(tokenCaja);
    final esperado = (turnoViejo['esperado'] as num).toDouble();
    final contado = esperado + 1000;

    app.main();
    await tester.pump();
    await _loginYIrAEstadoDeCaja(tester);

    await tester.tap(find.byKey(const Key('caja_cerrar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('cierre_dialogo')));
    await tester.enterText(
      find.byKey(const Key('cierre_contado')),
      contado.toStringAsFixed(2),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('cierre_confirmar')));
    await _esperar(tester, find.byKey(const Key('cierre_resultado')));
    expect(find.text('Contado: ${moneda(contado)}'), findsOneWidget);
    expect(find.text('Diferencia: ${moneda(1000)}'), findsOneWidget,
        reason: 'la diferencia la calcula el backend, no el cliente');
    expect(find.byKey(const Key('cierre_resultado_alerta')), findsOneWidget);

    await tester.tap(find.byKey(const Key('cierre_listo')));
    await _esperar(tester, find.text('Esperado en caja: \$0,00'));

    final turnoNuevo = await _estadoRemoto(tokenCaja);
    expect(turnoNuevo['id'], isNot(turnoViejo['id']));

    // §7 permisos: el backend rechaza el cierre del vendedor (sin mock).
    final (statusVendedor, bodyVendedor) = await _postJson(
      '/api/v1/caja/cerrar',
      tokenVenta,
      body: {'id': turnoNuevo['id'], 'real': 0},
    );
    expect(statusVendedor, 403, reason: bodyVendedor);
    expect(bodyVendedor, contains('No tenés permiso'),
        reason: 'el mensaje de autorización lo produce el backend');
  });
}
