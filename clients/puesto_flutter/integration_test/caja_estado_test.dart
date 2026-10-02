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

/// Fase 4.2.1 — estado y movimientos de caja (Windows): la vista "Estado de
/// caja" muestra el turno real (`GET /api/v1/caja`) y el refresco trae los
/// cobros nuevos. Sin mocks: la UI se compara contra un snapshot del mismo
/// endpoint tomado por HTTP crudo, contra el backend real + Neon DEV.
///
/// Requiere el backend corriendo en 8080 contra Neon DEV:
///   flutter test integration_test/caja_estado_test.dart -d windows
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

Future<(int, String)> _getRaw(String path, String token) async {
  final res = await _http.get(
    Uri.parse('${AppConfig.apiBaseUrl}$path'),
    headers: {'accept': 'application/json', 'authorization': 'Bearer $token'},
  );
  return (res.statusCode, res.body);
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

/// Cobra el pedido como cajero y devuelve el cobro registrado por el backend.
Future<Map<String, dynamic>> _cobrarRaw(String tokenCaja, String pedidoId) async {
  final (status, body) = await _postJson(
    '/api/v1/pedidos/$pedidoId/cobrar',
    tokenCaja,
    body: {'clientUuid': generarUuidV4(), 'formaPago': 'efectivo'},
  );
  expect(status, 200, reason: 'POST /cobrar: $body');
  return (jsonDecode(body) as Map<String, dynamic>)['data'] as Map<String, dynamic>;
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

  await tester.tap(find.text('Caja'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_lista')));

  await tester.tap(find.text('Estado de caja'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_estado_contenido')));
}

/// Verifica que la UI muestra exactamente [estado] (mismo endpoint, sin mock).
/// La lista es perezosa: cada fila se busca desplazando la vista hacia abajo.
Future<void> _asegurarUiCoincideConBackend(
  WidgetTester tester,
  Map<String, dynamic> estado,
) async {
  final scrollable = find.descendant(
    of: find.byKey(const Key('caja_estado_contenido')),
    matching: find.byType(Scrollable),
  );
  expect(
    tester.widget<Text>(find.byKey(const Key('caja_estado_id'))).data,
    'Caja: ${estado['id']}',
  );
  expect(
    tester.widget<Text>(find.byKey(const Key('caja_estado_abierto'))).data,
    'Turno abierto desde: ${fechaCorta(estado['abiertoAt'] as String)}',
  );
  expect(
    tester.widget<Text>(find.byKey(const Key('caja_estado_esperado'))).data,
    'Esperado en caja: ${moneda((estado['esperado'] as num).toDouble())}',
  );

  final totales = (estado['totales'] as List).cast<Map<String, dynamic>>();
  expect(totales, isNotEmpty, reason: 'el fixture garantiza al menos un cobro');
  for (final total in totales) {
    final fila = find.byKey(Key('caja_estado_total_${total['formaPago']}'));
    expect(fila, findsOneWidget, reason: 'total por forma de pago en la UI');
    final n = total['n'] as int;
    final monto = moneda((total['total'] as num).toDouble());
    expect(
      find.descendant(
        of: fila,
        matching: find.text('$monto · $n ${n == 1 ? 'cobro' : 'cobros'}'),
      ),
      findsOneWidget,
    );
  }

  final ultimos = (estado['ultimos'] as List).cast<Map<String, dynamic>>();
  for (final cobro in ultimos) {
    final fila = find.byKey(Key('caja_mov_fila_${cobro['id']}'));
    await tester.scrollUntilVisible(fila, 80, scrollable: scrollable);
    expect(fila, findsOneWidget, reason: 'la UI lista el cobro ${cobro['id']}');
    expect(
      find.descendant(
        of: fila,
        matching:
            find.textContaining(moneda((cobro['monto'] as num).toDouble())),
      ),
      findsOneWidget,
    );
    final numero = cobro['numero'];
    expect(
      find.descendant(
        of: fila,
        matching: find.text(numero == null ? '—' : 'Nº $numero'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila, matching: find.text(cobro['cliente'] as String)),
      findsOneWidget,
    );
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets(
      'estado de caja: datos reales del backend y refresco con cobro nuevo',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);

    // Fixture: al menos un cobro en el turno para que la vista tenga datos.
    final pedido1 = await _crearPedidoRaw(tokenVenta);
    await _cobrarRaw(tokenCaja, pedido1['id'] as String);

    app.main();
    await tester.pump();
    await _loginYIrAEstadoDeCaja(tester);

    // Snapshot del mismo endpoint que consume la UI; la vista debe reflejarlo.
    await _asegurarUiCoincideConBackend(tester, await _estadoRemoto(tokenCaja));

    // Cobro nuevo por fuera de la UI; el refresco debe traerlo.
    final pedido2 = await _crearPedidoRaw(tokenVenta);
    final cobro2 = await _cobrarRaw(tokenCaja, pedido2['id'] as String);
    final cobroId2 = cobro2['cobroId'] as String;
    final estado2 = await _estadoRemoto(tokenCaja);

    // La verificación anterior termina con la lista al final: volver al tope,
    // donde está el botón de refresco y quedará el cobro más nuevo.
    await tester.drag(
      find.byKey(const Key('caja_estado_contenido')),
      const Offset(0, 3000),
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('caja_estado_refrescar')));
    await tester.pump();
    await _esperar(tester, find.byKey(Key('caja_mov_fila_$cobroId2')));

    expect((estado2['ultimos'] as List).first['id'], cobroId2,
        reason: 'el cobro más reciente va primero');
    await _asegurarUiCoincideConBackend(tester, estado2);
    expect(
      find.descendant(
        of: find.byKey(Key('caja_mov_fila_$cobroId2')),
        matching: find.textContaining(
            moneda((cobro2['total'] as num).toDouble())),
      ),
      findsOneWidget,
      reason: 'el cobro nuevo se muestra con el monto real del backend',
    );

    // §7 permisos: el backend rechaza al rol no autorizado (sin mock).
    final (statusVendedor, bodyVendedor) = await _getRaw('/api/v1/caja', tokenVenta);
    expect(statusVendedor, 403, reason: bodyVendedor);
    expect(bodyVendedor, contains('No tenés permiso'),
        reason: 'el mensaje de autorización lo produce el backend');
  });
}
