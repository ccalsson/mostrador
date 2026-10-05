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

/// Fase 4.1 — caja (Windows): recepción de pedidos, edición de ítems, cobro
/// con vuelto real del backend, ticket y protección contra doble cobro. Las
/// fixtures se arman por HTTP crudo (sign-in + pedido como vendedor) para no
/// tocar el secure storage que el flujo de UI necesita limpio.
///
/// Requiere el backend contra Neon DEV:
///   flutter test integration_test/caja_cobro_test.dart -d windows
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

Future<Map<String, dynamic>> _detalleRemoto(String token, String pedidoId) async =>
    (await _getJson('/api/v1/pedidos/$pedidoId', token))['data']
        as Map<String, dynamic>;

Future<String> _estadoRemoto(String token, String pedidoId) async =>
    (await _detalleRemoto(token, pedidoId))['estado'] as String;

/// Eventos `cobro` de auditoría para un pedido (requiere rol admin).
Future<int> _cobrosAuditados(String tokenDueno, String pedidoId) async {
  final auditoria = await _getJson('/api/v1/auditoria', tokenDueno);
  var total = 0;
  for (final entrada in (auditoria['data'] as List).cast<Map<String, dynamic>>()) {
    if (entrada['accion'] != 'cobro') continue;
    final detalle = entrada['detalle'];
    final mapa = detalle is String ? jsonDecode(detalle) : detalle;
    if (mapa is Map && mapa['pedidoId'] == pedidoId) total++;
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

/// Espera a que [finder] desaparezca (p. ej. un diálogo en animación de cierre).
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

/// Espera a que el `Text` de [finder] muestre exactamente [esperado].
Future<void> _esperarTexto(
  WidgetTester tester,
  Finder finder,
  String esperado, {
  Duration timeout = const Duration(seconds: 30),
}) async {
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
  fail('Nunca mostró "$esperado"; quedó en "$visto"');
}

Future<void> _drenarSnackBar(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump();
}

/// Login del cajero y navegación a la pantalla de Caja.
Future<void> _loginYIrACaja(WidgetTester tester) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), _emailCaja);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('catalogo_lista')));

  await tester.tap(find.text('Caja'));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_lista')));
}

Future<void> _abrirDetalleCaja(WidgetTester tester, String pedidoId) async {
  final tile = find.byKey(Key('caja_tile_$pedidoId'));
  await _esperar(tester, tile);
  await tester.tap(tile);
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('caja_detalle')));
}

/// Abre el diálogo de cobro y, opcionalmente, carga el importe recibido.
Future<void> _abrirCobroEnUi(WidgetTester tester, {double? recibido}) async {
  await _esperar(tester, find.byKey(const Key('caja_cobrar')));
  await tester.tap(find.byKey(const Key('caja_cobrar')));
  await tester.pump();
  await _esperar(tester, find.byKey(const Key('cobro_dialogo')));
  if (recibido != null) {
    await tester.enterText(
      find.byKey(const Key('cobro_recibido')),
      recibido.toStringAsFixed(2),
    );
    await tester.pump();
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('recepción: la caja ve el pedido del vendedor y su detalle',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    final total = ((await _detalleRemoto(tokenVenta, id))['total'] as num).toDouble();

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);

    final tile = find.byKey(Key('caja_tile_$id'));
    await _esperar(tester, tile);
    expect(
      find.descendant(of: tile, matching: find.textContaining('Enviado')),
      findsOneWidget,
    );

    await _abrirDetalleCaja(tester, id);
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_id'))).data,
      'Nº $id',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_cliente'))).data,
      'Cliente: Mostrador E2E',
    );
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_total')),
      'Total: ${moneda(total)}',
    );
    expect(find.byKey(const Key('caja_cobrar')), findsOneWidget);
    expect(find.byKey(const Key('caja_editar_items')), findsOneWidget);
  });

  testWidgets('cobro: confirmación, vuelto real, relectura del pedido y ticket',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    final total = ((await _detalleRemoto(tokenVenta, id))['total'] as num).toDouble();
    final recibido = redondear2(total + 50);
    final vuelto = moneda(redondear2(recibido - total));

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);
    await _abrirDetalleCaja(tester, id);

    await _abrirCobroEnUi(tester, recibido: recibido);
    expect(
      tester.widget<Text>(find.byKey(const Key('cobro_total'))).data,
      'Total: ${moneda(total)}',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('cobro_vuelto'))).data,
      vuelto,
      reason: 'estimación local antes de confirmar',
    );

    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('caja_cobro_exito')));
    await _esperarSin(tester, find.byKey(const Key('cobro_dialogo')));

    expect(
      find.text('Total: ${moneda(total)} · Vuelto: $vuelto'),
      findsOneWidget,
      reason: 'el vuelto mostrado es el que calculó el backend',
    );
    expect(find.textContaining('Comprobante: cob_'), findsOneWidget,
        reason: 'la UI muestra el ID del cobro');
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_estado')),
      'Cobrado',
    );
    expect(find.byKey(const Key('caja_cobrar')), findsNothing);
    expect(await _estadoRemoto(tokenVenta, id), 'cobrado',
        reason: 'el estado real del pedido lo confirma el backend');

    await tester.tap(find.byKey(const Key('caja_ver_ticket')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('ticket_contenido')));
    expect(find.text('Vuelto: $vuelto'), findsOneWidget,
        reason: 'el ticket refleja el vuelto registrado');
    expect(find.text('Recibido: ${moneda(recibido)}'), findsOneWidget);
    // Se verifica presencia y habilitación sin tap: el diálogo de impresión
    // nativo bloquearía el test hasta intervención del operador.
    final imprimir = tester.widget<FilledButton>(
      find.byKey(const Key('ticket_imprimir')),
    );
    expect(imprimir.onPressed, isNotNull,
        reason: 'con ticket cargado la impresión del sistema está disponible');
    await tester.tap(find.byKey(const Key('ticket_cerrar')));
    await tester.pump();
    await _esperarSin(tester, find.byKey(const Key('ticket_dialogo')));
  });

  testWidgets('doble acción: un cobro por doble clic y reintento idempotente',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final tokenDueno = await _signIn(_emailDueno);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);
    await _abrirDetalleCaja(tester, id);
    await _abrirCobroEnUi(tester);

    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    // Segundo clic inmediato: el guard del cliente evita el doble envío.
    await tester.tap(
      find.byKey(const Key('cobro_confirmar')),
      warnIfMissed: false,
    );
    await tester.pump();

    await _esperar(tester, find.byKey(const Key('caja_cobro_exito')));
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_estado')),
      'Cobrado',
    );
    expect(await _cobrosAuditados(tokenDueno, id), 1,
        reason: 'un doble clic no debe generar dos cobros');

    // El contrato garantiza idempotencia por (tenant, clientUuid): repetir el
    // mismo POST devuelve el cobro ya registrado sin duplicar auditoría.
    final otro = await _crearPedidoRaw(tokenVenta);
    final otroId = otro['id'] as String;
    final uuid = generarUuidV4();
    final (s1, b1) = await _postJson(
      '/api/v1/pedidos/$otroId/cobrar',
      tokenCaja,
      body: {'clientUuid': uuid, 'formaPago': 'efectivo'},
    );
    expect(s1, 200, reason: b1);
    final cobro1 = (jsonDecode(b1) as Map<String, dynamic>)['data']
        as Map<String, dynamic>;
    final (s2, b2) = await _postJson(
      '/api/v1/pedidos/$otroId/cobrar',
      tokenCaja,
      body: {'clientUuid': uuid, 'formaPago': 'efectivo'},
    );
    expect(s2, 200, reason: b2);
    final cobro2 = (jsonDecode(b2) as Map<String, dynamic>)['data']
        as Map<String, dynamic>;
    expect(cobro2['cobroId'], cobro1['cobroId'],
        reason: 'el reintento devuelve el mismo cobro');
    expect(await _cobrosAuditados(tokenDueno, otroId), 1,
        reason: 'el reintento idempotente no duplica la auditoría');
  });

  testWidgets('estado no cobrable: sin acciones y el backend rechaza',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    await _cobrarRaw(tokenCaja, id);

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);

    await tester.tap(find.text('Cobrados'));
    await tester.pump();
    await _abrirDetalleCaja(tester, id);
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_estado')),
      'Cobrado',
    );
    expect(find.byKey(const Key('caja_cobrar')), findsNothing,
        reason: 'un pedido cobrado ya no se cobra');
    expect(find.byKey(const Key('caja_editar_items')), findsNothing,
        reason: 'un pedido cobrado ya no se edita');

    final (status, body) = await _postJson(
      '/api/v1/pedidos/$id/cobrar',
      tokenCaja,
      body: {'clientUuid': generarUuidV4(), 'formaPago': 'efectivo'},
    );
    expect(status, 400, reason: body);
    expect(body, contains('El pedido ya está cobrado.'));
  });

  testWidgets('error de cobro: el diálogo avisa y el pedido no se pierde',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final tokenCaja = await _signIn(_emailCaja);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);
    await _abrirDetalleCaja(tester, id);
    await _abrirCobroEnUi(tester);

    // Otra caja cobra el pedido mientras el diálogo sigue abierto.
    await _cobrarRaw(tokenCaja, id);

    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('cobro_error')));

    expect(find.byKey(const Key('cobro_dialogo')), findsOneWidget);
    expect(find.textContaining('ya está cobrado'), findsOneWidget,
        reason: 'el mensaje del backend llega al diálogo');
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Enviado',
      reason: 'el estado mostrado no se altera artificialmente',
    );

    await tester.tap(find.byKey(const Key('cobro_cancelar')));
    await tester.pump();
    await _esperarSin(tester, find.byKey(const Key('cobro_dialogo')));

    await tester.tap(find.byKey(const Key('caja_detalle_refrescar')));
    await tester.pump();
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_estado')),
      'Cobrado',
    );
    expect(find.byKey(const Key('caja_cobrar')), findsNothing);
  });

  testWidgets('edición: el backend recalcula el total y el pedido sigue pendiente',
      (tester) async {
    final tokenVenta = await _signIn(_emailVenta);
    final pedido = await _crearPedidoRaw(tokenVenta);
    final id = pedido['id'] as String;
    final antes = await _detalleRemoto(tokenVenta, id);
    final item =
        (antes['items'] as List).cast<Map<String, dynamic>>().single;
    final productoId = item['productoId'] as String;
    final precio = (item['precioUnitario'] as num).toDouble();
    final esperado = redondear2(precio * 2);

    app.main();
    await tester.pump();
    await _loginYIrACaja(tester);
    await _abrirDetalleCaja(tester, id);

    await tester.tap(find.byKey(const Key('caja_editar_items')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('items_dialogo')));

    await tester.enterText(
      find.byKey(Key('items_cantidad_$productoId')),
      '2',
    );
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('items_total_estimado'))).data,
      'Total estimado: ${moneda(esperado)}',
    );

    await tester.tap(find.byKey(const Key('items_guardar')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('items_confirmar')));
    await tester.tap(find.byKey(const Key('items_confirmar_aceptar')));
    await tester.pump();

    await _esperar(tester, find.text('Ítems actualizados.'));
    await _esperarSin(tester, find.byKey(const Key('items_dialogo')));
    await _esperarTexto(
      tester,
      find.byKey(const Key('caja_detalle_total')),
      'Total: ${moneda(esperado)}',
    );

    final despues = await _detalleRemoto(tokenVenta, id);
    expect((despues['total'] as num).toDouble(), esperado,
        reason: 'el total definitivo lo recalcula el backend');
    expect(despues['estado'], 'enviado',
        reason: 'editar ítems no cobra el pedido');
    await _drenarSnackBar(tester);
  });
}
