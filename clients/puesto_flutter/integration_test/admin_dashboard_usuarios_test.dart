import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/main.dart' as app;

const _emailDueno = String.fromEnvironment(
  'E2E_ADMIN_EMAIL',
  defaultValue: 'dueno@frutasroman.com',
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

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
  // El admin ve el Dashboard al entrar
  await _esperar(tester, find.byKey(const Key('dashboard_lista')));
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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('Admin dashboard y gestión de usuarios', (tester) async {
    await _signIn(_emailDueno);
    app.main();
    await tester.pump();
    await _login(tester, _emailDueno);

    // 1. Verificar Dashboard
    await tester.tap(find.text('30d')); // Cambiar periodo
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('dashboard_total_ventas')));
    await _esperar(tester, find.text('Datos de los últimos 30 días'));

    // 2. Navegar a Usuarios
    await _tocarPildora(tester, 'Usuarios');
    await _esperar(tester, find.byKey(const Key('admin_usuarios_lista')));

    // 3. Crear usuario
    final emailAleatorio =
        'test${DateTime.now().microsecondsSinceEpoch}@frutasroman.com';
    await tester.tap(find.byKey(const Key('admin_nuevo_usuario')));
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('admin_usuario_email')));
    
    await tester.enterText(find.byKey(const Key('admin_usuario_nombre')), 'Nuevo Vendedor');
    await tester.enterText(find.byKey(const Key('admin_usuario_email')), emailAleatorio);
    await tester.enterText(find.byKey(const Key('admin_usuario_password')), 'secreta123');
    await tester.tap(find.byKey(const Key('admin_usuario_guardar')));

    await _esperarSin(tester, find.byKey(const Key('admin_usuario_email')));
    // El subtítulo del tile es `email · rol`: buscar por contenido y scrollear
    // hasta el tile, porque la lista ordena por nombre y puede quedar abajo.
    await _esperar(tester, find.byKey(const Key('admin_usuarios_lista')));
    final tileNuevo = find.ancestor(
      of: find.textContaining(emailAleatorio),
      matching: find.byType(ListTile),
    );
    await tester.scrollUntilVisible(
      tileNuevo,
      150,
      scrollable: find.descendant(
        of: find.byKey(const Key('admin_usuarios_lista')),
        matching: find.byType(Scrollable),
      ),
    );

    // 4. Toggle estado (desactivar)
    final findToggle = find.descendant(
      of: tileNuevo,
      matching: find.byType(Switch),
    );
    expect(tester.widget<Switch>(findToggle).value, true);
    await tester.tap(findToggle);
    await tester.pumpAndSettle();

    await _esperar(
      tester,
      find.descendant(
        of: tileNuevo,
        matching: find.text('Inactivo'),
      ),
    );
  });
}
