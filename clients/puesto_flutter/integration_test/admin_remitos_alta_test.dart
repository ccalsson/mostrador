import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/features/admin/remito_detalle_pane.dart';
import 'package:puesto_flutter/main.dart' as app;

const _emailDueno = String.fromEnvironment(
  'E2E_ADMIN_EMAIL',
  defaultValue: 'dueno@frutasroman.com',
);
const _password =
    String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');
const _proveedor = String.fromEnvironment(
  'E2E_PROVEEDOR',
  defaultValue: 'Proveedor E2E A3',
);

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

String? _proveedorSeleccionado(WidgetTester tester) {
  final finder = find.byType(DropdownButtonFormField<String>);
  if (finder.evaluate().isEmpty) return null;
  return tester.state<FormFieldState<String>>(finder.first).value;
}

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tester.tap(find.byKey(const Key('login_submit')));
  await tester.pump();
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

  testWidgets('admin crea remito manual con proveedor y línea', (tester) async {
    await _signIn(_emailDueno);
    app.main();
    await tester.pump();
    await _login(tester, _emailDueno);

    await _tocarPildora(tester, 'Remitos');
    await _esperar(tester, find.text('Nuevo remito'));

    await tester.tap(find.text('Nuevo remito'));
    await tester.pump();
    await _esperar(tester, find.text('Ingreso de mercadería'));

    await tester.ensureVisible(find.byKey(const Key('admin_remito_proveedor')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('admin_remito_proveedor')));
    await tester.pumpAndSettle();
    await _esperar(tester, find.text(_proveedor));
    await tester.tap(find.text(_proveedor).last, warnIfMissed: false);
    await tester.pumpAndSettle();
    if (_proveedorSeleccionado(tester) == null) {
      // El toque directo no siempre alcanza el overlay del menú en desktop:
      // reabrir y navegar con teclado.
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('admin_remito_proveedor')),
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();
      await _esperar(tester, find.text(_proveedor));
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
    }
    expect(
      _proveedorSeleccionado(tester),
      isNotNull,
      reason: 'No se pudo seleccionar "$_proveedor" en el desplegable',
    );

    await tester.enterText(
      find.byKey(const Key('admin_remito_linea_0')),
      'Tomate e2e',
    );
    await tester.ensureVisible(find.byKey(const Key('admin_remito_cargar')));
    await tester.tap(find.byKey(const Key('admin_remito_cargar')));
    await tester.pump();

    await _esperar(
      tester,
      find.byType(RemitoDetallePane),
      timeout: const Duration(seconds: 45),
    );
  });
}
