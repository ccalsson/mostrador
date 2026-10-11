import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/main.dart' as app;

import 'e2e_sesion.dart';

/// Suscripción y Legal (Parte A de app/docs/suscripcion-legal-propuesta.md):
/// la píldora existe sólo para el Dueño y el panel muestra el resumen real de
/// `/api/v1/suscripcion` (implementado en F1-M8; el puesto DEV está linkeado a
/// Torre). Un token de vendedor recibe 403 `rol_no_permitido`.
///
/// Requiere backend con /api/v1/suscripcion contra Neon DEV:
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

Future<String> _signIn(String email) => signInConReintentos(
      _http,
      Uri.parse('${AppConfig.apiBaseUrl}/api/auth/sign-in/email'),
      {'content-type': 'application/json', 'origin': AppConfig.authOrigin},
      jsonEncode({'email': email, 'password': _password}),
      motivo: 'sign-in $email',
    );

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
  if (email == _emailDueno) {
    await tocaLoginHasta(tester, find.byKey(const Key('dashboard_lista')));
  } else {
    await tocaLoginHasta(tester, find.byKey(const Key('catalogo_lista')));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('Suscripción: píldora solo del Dueño y resumen real del puesto',
      (tester) async {
    await _signIn(_emailDueno);
    await _signIn(_emailVenta);

    app.main();
    await tester.pump();
    await _login(tester, _emailDueno);

    // ---- Dueño: la sección existe y muestra el resumen real de la API ----
    await _tocarPildora(tester, 'Suscripción');
    await _esperar(tester, find.byKey(const Key('suscripcion_lista')));
    expect(find.textContaining('Plan: '), findsOneWidget);
    expect(find.byKey(const Key('suscripcion_ver_contrato')), findsOneWidget);
    expect(find.byKey(const Key('suscripcion_ver_historial')), findsOneWidget);

    // ---- Vendedor: la píldora no existe para su rol ----
    await tester.tap(find.byKey(const Key('logout_button')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('login_email')));
    await _login(tester, _emailVenta);
    expect(find.text('Suscripción'), findsNothing);

    // Prueba negativa HTTP: con token de vendedor el endpoint responde 403.
    final tokenVenta = await _signIn(_emailVenta);
    final res = await _http.get(
      Uri.parse('${AppConfig.apiBaseUrl}/api/v1/suscripcion'),
      headers: {
        'accept': 'application/json',
        'authorization': 'Bearer $tokenVenta',
      },
    );
    expect(res.statusCode, 403,
        reason: 'vendedor no debe leer la suscripción: ${res.body}');
    expect(res.body, contains('rol_no_permitido'));
  });
}
