import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/main.dart' as app;

import 'e2e_sesion.dart';

const _emailDueno = String.fromEnvironment(
  'E2E_ADMIN_EMAIL',
  defaultValue: 'dueno@frutasroman.com',
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

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  // El admin ve el Dashboard al entrar
  await tocaLoginHasta(tester, find.byKey(const Key('dashboard_lista')));
}

/// El menú de secciones es una fila horizontal de píldoras: en pantallas
/// angostas las últimas quedan fuera del viewport. Desplaza el menú hasta la
/// píldora y recién ahí toca.
Future<void> _tocarPildora(WidgetTester tester, String etiqueta) =>
    irASeccion(tester, etiqueta);

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
    await tester.tap(find.text('30 días')); // Cambiar periodo
    await tester.pump();
    await _esperar(tester, find.byKey(const Key('dashboard_total_ventas')));
    await _esperar(tester, find.text('Datos de los últimos 30 días'));

    // 2. Navegar a Usuarios
    await _tocarPildora(tester, 'Usuarios');
    await _esperar(tester, find.byKey(const Key('admin_usuarios_lista')));

    // 3. Crear usuario: el formulario se abre con "Nuevo usuario" (rail en
    // pantallas anchas, diálogo en angostas).
    final emailAleatorio =
        'test${DateTime.now().microsecondsSinceEpoch}@frutasroman.com';
    await tester.tap(find.byKey(const Key('admin_nuevo_usuario')));
    await _esperar(tester, find.byKey(const Key('admin_usuario_email')));
    
    await tester.enterText(find.byKey(const Key('admin_usuario_nombre')), 'Nuevo Vendedor');
    await tester.enterText(find.byKey(const Key('admin_usuario_email')), emailAleatorio);
    await tester.enterText(find.byKey(const Key('admin_usuario_password')), 'secreta123');
    await tester.tap(find.byKey(const Key('admin_usuario_guardar')));

    // El form es inline y persiste (solo se limpia): el snackbar confirma el alta.
    await _esperar(tester, find.text('Usuario creado.'));
    // Esperar a que la lista se actualice (el provider se invalida tras el alta).
    // Múltiples pumps para asegurar que todas las operaciones async completen.
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    // Buscar el nuevo usuario por nombre (más confiable que el email).
    await _esperar(tester, find.text('Nuevo Vendedor'), timeout: const Duration(seconds: 10));
    
    // 4. Toggle estado (desactivar)
    // Buscar el Switch que está en la misma fila que el nombre "Nuevo Vendedor".
    // La fila es un InkWell que contiene el nombre y el Switch como descendientes.
    final filaNuevo = find.ancestor(
      of: find.text('Nuevo Vendedor'),
      matching: find.byType(InkWell),
    ).first;
    final findToggle = find.descendant(
      of: filaNuevo,
      matching: find.byType(Switch),
    );
    expect(tester.widget<Switch>(findToggle).value, true);
    await tester.tap(findToggle);
    await tester.pumpAndSettle();

    await _esperar(
      tester,
      find.descendant(
        of: filaNuevo,
        matching: find.text('Baja'),
      ),
    );
  });
}
