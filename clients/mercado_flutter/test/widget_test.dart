import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mercado_al_toque/login_screen.dart';
import 'package:mercado_al_toque/market_api.dart';

void main() {
  testWidgets('Muestra los perfiles comprador y cargador', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          api: MercadoApi(),
          onAuthenticated: (_) {},
          onRetry: () {},
        ),
      ),
    );

    expect(find.text('Mercado al Toque'), findsOneWidget);
    expect(find.text('Comprador'), findsOneWidget);
    expect(find.text('Cargador'), findsOneWidget);
    expect(find.text('Continuar con Google'), findsOneWidget);
  });
}
