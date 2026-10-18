import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mercado_al_toque/market_api.dart';
import 'package:mercado_al_toque/widgets/public_links.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  test('URLs públicas conservan /apps y sólo envían app=mercado', () {
    for (final base in [
      'https://public.example/apps',
      'https://public.example/apps/',
      'https://public.example/apps?token=privado&email=persona#secreto',
    ]) {
      for (final page in PublicPage.values) {
        expect(publicPageUri(page, baseUrl: base).toString(),
            'https://public.example/apps/${page.fileName}?app=mercado');
      }
    }
  });

  test('Registro usa el origen de API, sin ruta, query ni fragmento heredados', () {
    for (final profile in ['comprador', 'cargador']) {
      final uri = marketRegistrationUri(
        profile: profile,
        baseUrl: 'https://api.example:8443/api/mercado/v1?token=privado&email=persona#secreto',
      )!;
      expect(uri.toString(),
          'https://api.example:8443/registro-mercado.html?perfil=$profile');
      expect(uri.userInfo, isEmpty);
      expect(uri.hasFragment, isFalse);
    }
    expect(marketRegistrationUri(profile: 'admin',
        baseUrl: 'https://api.example'), isNull);
    expect(marketRegistrationUri(profile: 'comprador'),
        marketRegistrationUri(profile: 'comprador', baseUrl: apiBaseUrl));
  });

  test('HTTP sólo se permite en los tres hosts locales y en debug', () {
    for (final host in ['localhost', '127.0.0.1', '10.0.2.2']) {
      final base = 'http://$host:8080/api/mercado/v1';
      expect(publicPageUri(PublicPage.support, baseUrl: base,
          allowLocalHttp: true)?.port, 8080);
      expect(publicPageUri(PublicPage.support, baseUrl: base,
          allowLocalHttp: false), isNull);
      expect(marketRegistrationUri(profile: 'cargador', baseUrl: base,
          allowLocalHttp: true).toString(),
          'http://$host:8080/registro-mercado.html?perfil=cargador');
      expect(marketRegistrationUri(profile: 'cargador', baseUrl: base,
          allowLocalHttp: false), isNull);
    }
  });

  test('Rechaza configuración ausente, esquemas ajenos y credenciales', () {
    for (final base in [
      '', '   ', '/apps', 'https://', 'https://[malformado',
      'https://user:pass@public.example/apps',
      'http://public.example/apps', 'http://192.168.0.101:8080/apps',
      'http://localhost.evil.example/apps', 'javascript:alert(1)',
      'file:///apps', 'mercado://apps',
    ]) {
      expect(publicPageUri(PublicPage.privacy, baseUrl: base,
          allowLocalHttp: true), isNull, reason: base);
      expect(marketRegistrationUri(profile: 'comprador', baseUrl: base,
          allowLocalHttp: true), isNull, reason: base);
    }
    expect(publicPageUri(PublicPage.privacy,
        baseUrl: 'https://public.example/%FF'), isNull);
  });

  testWidgets('Cuatro enlaces visibles y externos en pantalla angosta', (tester) async {
    final opened = <Uri>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 320,
          child: PublicLinks(
            baseUrl: 'https://public.example/apps',
            launcher: (uri, {required mode}) async {
              expect(mode, LaunchMode.externalApplication);
              opened.add(uri);
              return true;
            },
          ),
        ),
      ),
    ));
    for (final page in PublicPage.values) {
      expect(find.text(page.label), findsOneWidget);
      await tester.tap(find.text(page.label));
      await tester.pump();
    }
    expect(opened.map((uri) => uri.path),
        PublicPage.values.map((page) => '/apps/${page.fileName}'));
    expect(opened.every((uri) => uri.query == 'app=mercado'), isTrue);
    expect(find.byType(SnackBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final base in ['', 'javascript:alert(1)']) {
    testWidgets('Configuración inválida muestra SnackBar: $base', (tester) async {
      var launches = 0;
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: PublicLinks(
        baseUrl: base,
        launcher: (uri, {required mode}) async {
          launches++;
          return true;
        },
      ))));
      await tester.tap(find.text('Privacidad'));
      await tester.pumpAndSettle();
      expect(launches, 0);
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.textContaining('PUBLIC_SITE_URL no está configurada'), findsOneWidget);
    });
  }

  for (final throws in [false, true]) {
    testWidgets('Fallo de navegador muestra SnackBar (excepción: $throws)', (tester) async {
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: PublicLinks(
        baseUrl: 'https://public.example/apps',
        launcher: (uri, {required mode}) async {
          if (throws) throw PlatformException(code: 'no_browser');
          return false;
        },
      ))));
      await tester.tap(find.text('Solicitar eliminación de cuenta'));
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.textContaining('No se pudo abrir el enlace'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
