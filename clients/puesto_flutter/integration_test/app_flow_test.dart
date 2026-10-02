import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/main.dart' as app;

/// Vertical slice de Fase 2: login → catálogo → logout contra el backend DEV.
///
/// Requiere el backend corriendo (`npm run dev` en `app/`) y un usuario demo.
/// Por defecto usa el usuario de caja (Windows); para Android/vendedor:
/// `--dart-define=E2E_EMAIL=venta@frutasroman.com`.
const _email = String.fromEnvironment(
  'E2E_EMAIL',
  defaultValue: 'caja@frutasroman.com',
);
const _password = String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');

/// Polling de frames: `pumpAndSettle` no sirve porque hay un spinner
/// (CircularProgressIndicator) que anima indefinidamente.
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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    await const FlutterSecureStorage().deleteAll();
  });

  testWidgets('login → catálogo → logout', (tester) async {
    app.main();
    await tester.pump();

    await _esperar(tester, find.byKey(const Key('login_email')));
    await tester.enterText(find.byKey(const Key('login_email')), _email);
    await tester.enterText(find.byKey(const Key('login_password')), _password);
    await tester.tap(find.byKey(const Key('login_submit')));
    await tester.pump();

    await _esperar(tester, find.byKey(const Key('catalogo_lista')));
    expect(find.byType(ListTile), findsWidgets);

    await tester.tap(find.byKey(const Key('logout_button')));
    await _esperar(tester, find.byKey(const Key('login_email')));
  });

  testWidgets('credenciales inválidas muestran error en español', (tester) async {
    app.main();
    await tester.pump();

    await _esperar(tester, find.byKey(const Key('login_email')));
    await tester.enterText(find.byKey(const Key('login_email')), 'nadie@frutasroman.com');
    await tester.enterText(find.byKey(const Key('login_password')), 'clave-mala');
    await tester.tap(find.byKey(const Key('login_submit')));
    await tester.pump();

    await _esperar(tester, find.text('Correo o contraseña incorrectos.'));
  });
}
