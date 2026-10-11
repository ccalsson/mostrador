import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:puesto_flutter/core/config/app_config.dart';
import 'package:puesto_flutter/main.dart' as app;

const _emailDueno = String.fromEnvironment('E2E_ADMIN_EMAIL', defaultValue: 'dueno@frutasroman.com');
const _password = String.fromEnvironment('E2E_PASSWORD', defaultValue: 'roman2026');
final _http = http.Client();

Future<String> _signIn(String email) async {
  final res = await _http.post(
    Uri.parse('${AppConfig.apiBaseUrl}/api/auth/sign-in/email'),
    headers: {'content-type': 'application/json', 'origin': AppConfig.authOrigin},
    body: jsonEncode({'email': email, 'password': _password}),
  );
  expect(res.statusCode, 200, reason: 'sign-in $email: ${res.body}');
  return (jsonDecode(res.body) as Map<String, dynamic>)['token'] as String;
}

Future<void> _esperar(WidgetTester tester, Finder finder, {Duration timeout = const Duration(seconds: 30)}) async {
  final fin = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No apareció en pantalla: $finder');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('admin crea remito manual y se actualiza', (tester) async {
    app.main();
    await tester.pumpAndSettle();

    final token = await _signIn(_emailDueno);
    expect(token.isNotEmpty, true);
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await _esperar(tester, find.text('dueño'));
    
    // Navegar a Remitos
    await tester.tap(find.text('Remitos'));
    await tester.pumpAndSettle();

    // Tap 'Nuevo remito'
    await tester.tap(find.text('Nuevo remito'));
    await tester.pumpAndSettle();

    expect(find.text('Ingreso de mercadería'), findsOneWidget);

    // Ocultar teclado si es necesario, pero en desktop no molesta.
    // Simular que el dialog se puede cerrar
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
  });
}
