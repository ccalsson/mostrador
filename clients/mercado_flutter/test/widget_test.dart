import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:mercado_al_toque/login_screen.dart';
import 'package:mercado_al_toque/market_api.dart';
import 'package:mercado_al_toque/tema.dart';
import 'package:mercado_al_toque/widgets/public_links.dart';
import 'package:url_launcher/url_launcher.dart';

class _ApiFake extends MercadoApi {
  _ApiFake() : super(client: MockClient((request) async {
    throw StateError('La prueba no debe salir a la red');
  }));

  final logins = <String>[];

  @override
  Future<Map<String, dynamic>> signIn({
    required String email,
    required String password,
    required String profile,
  }) async {
    logins.add(profile);
    return {'perfil': profile};
  }
}

void main() {
  testWidgets('Muestra los perfiles comprador y cargador', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: temaClaro(),
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
    await tester.ensureVisible(find.byType(PublicLinks));
    for (final page in PublicPage.values) {
      expect(find.text(page.label), findsOneWidget);
    }
    expect(find.byType(Checkbox), findsNothing);
  });

  for (final profile in ['comprador', 'cargador']) {
    testWidgets('Registro externo conserva perfil $profile y el login normal', (tester) async {
      final api = _ApiFake();
      final opened = <Uri>[];
      Map<String, dynamic>? actor;
      await tester.pumpWidget(MaterialApp(
        theme: temaClaro(),
        home: LoginScreen(
          api: api,
          onAuthenticated: (value) => actor = value,
          onRetry: () {},
          registrationBaseUrl: 'https://api.example:8443/api/mercado/v1?token=privado#secreto',
          linkLauncher: (uri, {required mode}) async {
            expect(mode, LaunchMode.externalApplication);
            opened.add(uri);
            return true;
          },
        ),
      ));
      if (profile == 'cargador') await tester.tap(find.text('Cargador'));
      await tester.enterText(find.byType(TextFormField).first, 'persona@example.com');
      await tester.enterText(find.byType(TextFormField).last, 'password-prueba');
      await tester.ensureVisible(find.text('Crear una cuenta nueva'));
      await tester.tap(find.text('Crear una cuenta nueva'));
      await tester.pumpAndSettle();

      expect(opened.single.toString(),
          'https://api.example:8443/registro-mercado.html?perfil=$profile');
      expect(actor, isNull);
      expect(api.logins, isEmpty);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.textContaining('Tras confirmar tu correo, volvé aquí para ingresar.'),
          findsOneWidget);

      await tester.ensureVisible(find.text('Ingresar'));
      await tester.tap(find.text('Ingresar'));
      await tester.pumpAndSettle();
      expect(api.logins, [profile]);
      expect(actor?['perfil'], profile);
    });
  }

  testWidgets('Registro avisa si API_BASE_URL no es válida', (tester) async {
    var launches = 0;
    await tester.pumpWidget(MaterialApp(
      theme: temaClaro(),
      home: LoginScreen(
        api: _ApiFake(),
        onAuthenticated: (_) => fail('No debe autenticar durante el registro'),
        onRetry: () {},
        registrationBaseUrl: '',
        linkLauncher: (uri, {required mode}) async {
          launches++;
          return true;
        },
      ),
    ));
    await tester.ensureVisible(find.text('Crear una cuenta nueva'));
    await tester.tap(find.text('Crear una cuenta nueva'));
    await tester.pumpAndSettle();
    expect(launches, 0);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.textContaining('API_BASE_URL no está configurada'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
