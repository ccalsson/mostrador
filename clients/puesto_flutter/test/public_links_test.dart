import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/auth/auth_controller.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/core/widgets/public_links.dart';
import 'package:puesto_flutter/features/auth/login_screen.dart';
import 'package:puesto_flutter/features/shell/adaptive_shell.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/models/staff_session.dart';
import 'package:puesto_flutter/services/catalogo_service.dart';
import 'package:puesto_flutter/services/dashboard_service.dart';
import 'package:puesto_flutter/services/tenant_service.dart';
import 'package:url_launcher/url_launcher.dart';

class _AuthFake extends AuthController {
  @override
  AuthState build() => const AuthState.unauthenticated();
}

Widget _screen(Widget home) => ProviderScope(
  overrides: [
    authControllerProvider.overrideWith(_AuthFake.new),
    tenantProvider.overrideWith(
      (ref) async => const IdentidadTenant(nombre: 'Mostrador', bajada: ''),
    ),
    catalogoProvider.overrideWith(
      (ref) async => const Catalogo(productos: [], version: null),
    ),
    dashboardProvider.overrideWith((ref) => throw StateError('Sin datos')),
  ],
  child: MaterialApp(theme: temaClaro(), home: home),
);

void main() {
  test('URLs públicas conservan /apps y sólo envían app=mostrador', () {
    for (final base in [
      'https://public.example/apps',
      'https://public.example/apps/',
      'https://public.example/apps?token=privado&email=persona#secreto',
    ]) {
      for (final page in PublicPage.values) {
        final uri = publicPageUri(page, baseUrl: base)!;
        expect(uri.toString(),
            'https://public.example/apps/${page.fileName}?app=mostrador');
        expect(uri.userInfo, isEmpty);
        expect(uri.hasFragment, isFalse);
      }
    }
    expect(
      publicPageUri(PublicPage.privacy, baseUrl: 'https://public.example')!.path,
      '/privacidad.html',
    );
  });

  test('HTTP sólo se permite en los tres hosts locales y en debug', () {
    for (final host in ['localhost', '127.0.0.1', '10.0.2.2']) {
      final base = 'http://$host:8080/apps';
      expect(publicPageUri(PublicPage.support, baseUrl: base,
          allowLocalHttp: true)?.port, 8080);
      expect(publicPageUri(PublicPage.support, baseUrl: base,
          allowLocalHttp: false), isNull);
    }
  });

  test('Rechaza configuración ausente, esquemas ajenos y credenciales', () {
    for (final base in [
      '', '   ', '/apps', 'https://', 'https://[malformado',
      'https://public.example/%FF', 'https://user:pass@public.example/apps',
      'http://public.example/apps', 'http://192.168.0.101:8080/apps',
      'http://localhost.evil.example/apps', 'javascript:alert(1)',
      'file:///apps', 'mostrador://apps',
    ]) {
      expect(publicPageUri(PublicPage.privacy, baseUrl: base,
          allowLocalHttp: true), isNull, reason: base);
    }
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
    expect(opened.every((uri) => uri.query == 'app=mostrador'), isTrue);
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

  testWidgets('Login ofrece enlaces sin exigir aceptación', (tester) async {
    await tester.pumpWidget(_screen(const LoginScreen()));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Solicitar eliminación de cuenta'));
    for (final page in PublicPage.values) {
      expect(find.text(page.label), findsOneWidget);
    }
    expect(find.byType(Checkbox), findsNothing);
    expect(tester.widget<FilledButton>(find.byKey(const Key('login_submit')))
        .onPressed, isNotNull);
  });

  for (final role in Rol.values) {
    testWidgets('Sesión ofrece enlaces para ${role.name}', (tester) async {
      // Ancho < 900 => los tres roles usan el drawer (sidebar sólo para admin).
      await tester.binding.setSurfaceSize(const Size(800, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_screen(AdaptiveShell(rol: role)));
      // pump(Duration) en vez de pumpAndSettle: el pane inicial puede tener
      // un spinner infinito si el ApiClient real no resuelve en el test.
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      await tester.tap(find.byTooltip('Menú'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      final sesionFinder = find.text('Sesión');
      if (sesionFinder.evaluate().isEmpty) {
        // El bottom sheet tiene el ListView con más de 15 items; scrollear
        // manualmente hasta que aparezca 'Sesión'.
        for (var i = 0; i < 10 && sesionFinder.evaluate().isEmpty; i++) {
          await tester.drag(find.byType(ListView).last, const Offset(0, -200));
          await tester.pump(const Duration(milliseconds: 200));
        }
      }
      expect(sesionFinder, findsWidgets, reason: 'Sesión no apareció tras scrollear');
      await tester.tap(sesionFinder.last);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.byType(PublicLinks), findsOneWidget);
      for (final page in PublicPage.values) {
        expect(find.text(page.label), findsOneWidget);
      }
    });
  }
}
