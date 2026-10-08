import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/main.dart' as app;

/// Suscripción y Legal (Parte A de app/docs/suscripcion-legal-propuesta.md):
/// la píldora existe sólo para el Dueño y mientras Torre no publica
/// /api/v1/suscripcion el panel muestra el estado honesto de "no disponible
/// todavía" (404) sin parecer un error de red. Cuando Torre implemente el
/// endpoint, el mismo flujo debe mostrar el resumen y la prueba negativa de
/// roles pasa a esperar 403.
///
/// Requiere el backend corriendo en 8080 contra Neon DEV:
///   flutter test integration_test/admin_suscripcion_test.dart -d windows \
///     --dart-define=API_BASE_URL=http://127.0.0.1:8080
/// (desde el emulador Android: -d emulator-5554 y API_BASE_URL=10.0.2.2:8080)
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

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  if (email == _emailDueno) {
    await _esperar(tester, find.byKey(const Key('dashboard_lista')));
  } else {
    await _esperar(tester, find.byKey(const Key('catalogo_lista')));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('Suscripción: píldora solo del Dueño y estado honesto sin backend',
      (tester) async {
    await _signIn(_emailDueno);
    await _signIn(_emailVenta);

    app.main();
    await tester.pump();
    await _login(tester, _emailDueno);

    // ---- Dueño: la sección existe y hoy muestra el 404 honesto ----
    await _tocarPildora(tester, 'Suscripción');
    await _esperar(tester, find.byKey(const Key('suscripcion_no_disponible')));
    expect(find.text('La suscripción no está disponible todavía.'),
        findsOneWidget);

    // Reintentar vuelve a consultar: sigue el mismo estado mientras el
    // endpoint no exista (404, no error de red).
    await tester.tap(find.text('Reintentar'));
    await _esperar(tester, find.byKey(const Key('suscripcion_no_disponible')));

    // ---- Vendedor: la píldora no existe para su rol ----
    await tester.tap(find.byKey(const Key('logout_button')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('login_email')));
    await _login(tester, _emailVenta);
    expect(find.text('Suscripción'), findsNothing);

    // Prueba negativa HTTP: con token de vendedor el endpoint no responde
    // 200. Hoy (sin Torre) es 404 de ruta inexistente; al implementarse
    // debe pasar a 403 rol_no_permitido.
    final tokenVenta = await _signIn(_emailVenta);
    final res = await _http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/api/v1/suscripcion'),
      headers: {
        'accept': 'application/json',
        'authorization': 'Bearer $tokenVenta',
      },
    );
    expect(res.statusCode, isNot(200),
        reason: 'vendedor no debe leer la suscripción: ${res.body}');
  });
}
