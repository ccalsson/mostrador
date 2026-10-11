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

import 'e2e_sesion.dart';

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

String? _proveedorSeleccionado(WidgetTester tester) {
  final finder = find.byType(DropdownButtonFormField<String>);
  if (finder.evaluate().isEmpty) return null;
  return tester.state<FormFieldState<String>>(finder.first).value;
}

/// El menú del desplegable está abierto cuando sus ítems aparecen onstage en
/// el overlay: con el campo cerrado y sin selección, el IndexedStack interno
/// mantiene los mismos widgets offstage y el finder no los ve.
bool _menuProveedorAbierto() =>
    find.byType(DropdownMenuItem<String>).evaluate().isNotEmpty;

/// El DropdownButton interno tiene opciones recién cuando /proveedores
/// respondió (`DropdownButtonFormField` no expone `items`).
bool _proveedorItemsCargados(WidgetTester tester) {
  final dd = find.descendant(
    of: find.byKey(const Key('admin_remito_proveedor')),
    matching: find.byType(DropdownButton<String>),
  );
  if (dd.evaluate().isEmpty) return false;
  final items = tester.widget<DropdownButton<String>>(dd.first).items;
  return items != null && items.isNotEmpty;
}

/// Selecciona [_proveedor] en el desplegable. En desktop el toque sobre el
/// overlay del menú no es confiable (a veces cae en el barrier y lo cierra),
/// así que reintenta abrir + tocar el ítem (que primero asegura visible) y
/// cae a teclado; nunca pulsa escape, que cerraría el diálogo entero.
Future<void> _elegirProveedor(WidgetTester tester) async {
  final campo = find.byKey(const Key('admin_remito_proveedor'));

  // El desplegable recién tiene opciones cuando /proveedores responde.
  final fin = DateTime.now().add(const Duration(seconds: 30));
  while (DateTime.now().isBefore(fin) && !_proveedorItemsCargados(tester)) {
    await tester.pump(const Duration(milliseconds: 250));
  }

  for (var intento = 0;
      intento < 4 && _proveedorSeleccionado(tester) == null;
      intento++) {
    await tester.ensureVisible(campo);
    await tester.pumpAndSettle();
    await tester.tap(campo, warnIfMissed: false);
    await tester.pumpAndSettle();
    if (!_menuProveedorAbierto()) continue;

    final item = find.ancestor(
      of: find.text(_proveedor),
      matching: find.byType(DropdownMenuItem<String>),
    );
    if (item.evaluate().isEmpty) continue;
    await tester.ensureVisible(item.last);
    await tester.pumpAndSettle();
    await tester.tap(item.last, warnIfMissed: false);
    await tester.pumpAndSettle();
    if (_proveedorSeleccionado(tester) != null) return;

    // Plan B: teclado sobre el menú abierto (el ítem responde a Enter).
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
}

Future<void> _login(WidgetTester tester, String email) async {
  await _esperar(tester, find.byKey(const Key('login_email')));
  await tester.enterText(find.byKey(const Key('login_email')), email);
  await tester.enterText(find.byKey(const Key('login_password')), _password);
  await tocaLoginHasta(tester, find.byKey(const Key('dashboard_lista')));
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

    await _elegirProveedor(tester);

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
