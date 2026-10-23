import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/auth/auth_controller.dart';
import 'package:puesto_flutter/core/auth/session_boundary.dart';
import 'package:puesto_flutter/core/auth/token_store.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/core/routing/app_router.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/carrito/carrito_controller.dart';
import 'package:puesto_flutter/main.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/models/suscripcion.dart';
import 'package:puesto_flutter/services/catalogo_service.dart';
import 'package:puesto_flutter/services/conectividad_service.dart';
import 'package:puesto_flutter/services/offline_queue_service.dart';
import 'package:puesto_flutter/services/suscripcion_service.dart';
import 'package:puesto_flutter/services/tenant_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Tokens extends TokenStore {
  String? value = 'test-session';
  int clears = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async => value = token;

  @override
  Future<void> clear() async {
    clears++;
    value = null;
  }
}

class _ConectividadFake implements ConectividadService {
  bool conectado = true;

  @override
  Future<bool> hayConexion() async => conectado;

  @override
  void iniciar() {}

  @override
  void dispose() {}

  @override
  void addListener(void Function(bool) listener) {}

  @override
  void removeListener(void Function(bool) listener) {}
}

ApiClient _api(
  Future<http.Response> Function(http.Request) handler, {
  Future<String?> Function()? token,
  Duration timeout = const Duration(seconds: 5),
}) => ApiClient(
  baseUrl: 'http://api.test',
  tokenProvider: token ?? () async => 'test-session',
  httpClient: MockClient(handler),
  timeout: timeout,
);

http.Response _session({
  bool permission = true,
  bool protected = true,
  String tenant = 'casa',
  String rol = 'vendedor',
}) => http.Response(
  jsonEncode({
    'staff': {
      'id': 'stf_1',
      'nombre': 'Operador',
      'rol': rol,
      'puedeCambiar': permission,
    },
    'tenantId': tenant,
    'casaId': 'casa',
    'sucursal': tenant == 'casa' ? null : {'id': 'suc_1', 'nombre': 'Centro'},
    'contextoProtegido': protected,
  }),
  200,
);

Future<ProviderContainer> _auth(ApiClient api, _Tokens tokens) async {
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      tokenStoreProvider.overrideWithValue(tokens),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(api.close);
  final ready = Completer<void>();
  container.listen(authControllerProvider, (_, next) {
    if (next.status != AuthStatus.checking && !ready.isCompleted) {
      ready.complete();
    }
  }, fireImmediately: true);
  await ready.future;
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'tenant ligado a cada request; session siempre fresca y sin tenant',
    () async {
      final requests = <http.Request>[];
      final api = _api((request) async {
        requests.add(request);
        return http.Response('{}', 200, headers: {'etag': 'v1'});
      })..bindTenant('casa');
      addTearDown(api.close);
      await api.get('/api/v1/catalogo');
      await api.get('/api/v1/session');
      await api.get('/api/v1/session');
      api.bindTenant('centro');
      await api.get('/api/v1/catalogo');
      expect(requests[0].headers['x-mostrador-tenant'], 'casa');
      for (final request in requests.skip(1).take(2)) {
        expect(request.headers['x-mostrador-tenant'], isNull);
        expect(request.headers['if-none-match'], isNull);
      }
      expect(requests.last.headers['x-mostrador-tenant'], 'centro');
      expect(requests.last.headers['if-none-match'], isNull);
      expect(
        requests.last.headers['authorization'],
        requests.first.headers['authorization'],
      );
    },
  );

  test('cambio mientras espera token no envía el request viejo', () async {
    final token = Completer<String?>();
    var sent = 0;
    final api = _api((_) async {
      sent++;
      return http.Response('{}', 200);
    }, token: () => token.future)..bindTenant('casa');
    addTearDown(api.close);
    final pending = expectLater(
      api.post('/api/v1/pedidos'),
      throwsA(isA<ContextChangedException>()),
    );
    api.bindTenant('centro');
    token.complete('test-session');
    await pending;
    expect(sent, 0);
  });

  for (final status in [200, 401]) {
    test(
      'respuesta tardía $status no contamina contexto ni cierra nueva sesión',
      () async {
        final response = Completer<http.Response>();
        final sent = Completer<void>();
        var unauthorized = 0;
        final api = _api((_) {
          sent.complete();
          return response.future;
        })..bindTenant('casa');
        addTearDown(api.close);
        api.onUnauthorized = () => unauthorized++;
        final pending = expectLater(
          api.get('/api/v1/catalogo'),
          throwsA(isA<ContextChangedException>()),
        );
        await sent.future;
        api.bindTenant('centro');
        response.complete(
          http.Response('{}', status, headers: {'etag': 'viejo'}),
        );
        await pending;
        expect(unauthorized, 0);
      },
    );
  }

  test('cambio exclusivo bloquea acciones y un segundo cambio', () async {
    final response = Completer<http.Response>();
    var sent = 0;
    final api = _api((request) {
      sent++;
      expect(request.headers['x-mostrador-tenant'], 'casa');
      return response.future;
    })..bindTenant('casa');
    addTearDown(api.close);
    final first = api.postExclusive('/api/v1/sucursales/suc_1/usar');
    await expectLater(
      api.post('/api/v1/pedidos'),
      throwsA(isA<ContextChangedException>()),
    );
    await expectLater(
      api.postExclusive('/api/v1/sucursales/suc_2/usar'),
      throwsA(isA<ContextChangedException>()),
    );
    response.complete(http.Response('{}', 200));
    await first;
    await expectLater(
      api.get('/api/v1/catalogo'),
      throwsA(isA<ContextChangedException>()),
    );
    expect(sent, 1);
  });

  test('409 de contexto cierra transporte y notifica una sola vez', () async {
    var notifications = 0;
    var sent = 0;
    final api = _api((_) async {
      sent++;
      return http.Response('{"error":"contexto_desactualizado"}', 409);
    })..bindTenant('casa');
    addTearDown(api.close);
    api.onContextChanged = () => notifications++;
    await expectLater(
      api.post('/api/v1/pedidos'),
      throwsA(isA<ContextChangedException>()),
    );
    await expectLater(
      api.post('/api/v1/pedidos'),
      throwsA(isA<ContextChangedException>()),
    );
    expect(notifications, 1);
    expect(sent, 1);
  });

  for (final status in [200, 403]) {
    test('cambiar sucursal $status reinicia sin borrar el token', () async {
      final tokens = _Tokens();
      final api = _api(
        (request) async => request.url.path.endsWith('/session')
            ? _session()
            : http.Response(
                status == 403 ? '{"message":"permiso revocado"}' : '{}',
                status,
              ),
      );
      final container = await _auth(api, tokens);
      await container
          .read(authControllerProvider.notifier)
          .cambiarSucursal('suc_1');
      expect(
        container.read(authControllerProvider).status,
        AuthStatus.checking,
      );
      expect(
        container.read(sessionResetProvider),
        status == 200 ? 'Cambio de sucursal confirmado.' : 'permiso revocado',
      );
      expect(tokens.clears, 0);
      expect(tokens.value, 'test-session');
    });
  }

  test(
    'timeout de usar no anuncia éxito ni reabre el transporte anterior',
    () async {
      final tokens = _Tokens();
      final response = Completer<http.Response>();
      var mutations = 0;
      final api = _api((request) async {
        if (request.url.path.endsWith('/session')) return _session();
        mutations++;
        return response.future;
      }, timeout: const Duration(milliseconds: 20));
      final container = await _auth(api, tokens);
      await container
          .read(authControllerProvider.notifier)
          .cambiarSucursal('suc_1');
      expect(
        container.read(sessionResetProvider),
        contains('No se pudo confirmar'),
      );
      await expectLater(
        api.post('/api/v1/pedidos'),
        throwsA(isA<ContextChangedException>()),
      );
      response.complete(http.Response('{}', 200));
      await Future<void>.value();
      expect(
        container.read(sessionResetProvider),
        contains('No se pudo confirmar'),
      );
      expect(mutations, 1);
      expect(tokens.clears, 0);
    },
  );

  for (final permission in [false, true]) {
    test(
      'sin permiso o protocolo protegido no envía cambio: $permission',
      () async {
        var mutations = 0;
        final api = _api((request) async {
          if (request.url.path.endsWith('/session')) {
            return _session(permission: permission, protected: false);
          }
          mutations++;
          return http.Response('{}', 200);
        });
        final container = await _auth(api, _Tokens());
        await expectLater(
          container
              .read(authControllerProvider.notifier)
              .cambiarSucursal('suc_1'),
          throwsA(isA<ApiException>()),
        );
        expect(mutations, 0);
        expect(
          container.read(authControllerProvider).status,
          AuthStatus.authenticated,
        );
        expect(container.read(sessionResetProvider), isNull);
      },
    );
  }

  test(
    'logout mantiene Origin y pide reinicio aun sin respuesta del servidor',
    () async {
      final tokens = _Tokens();
      final api = _api((request) async {
        if (request.url.path.endsWith('/session')) return _session();
        expect(request.headers['origin'], isNotEmpty);
        throw http.ClientException('sin conexión');
      });
      final container = await _auth(api, tokens);
      await container.read(authControllerProvider.notifier).logout();
      expect(tokens.value, isNull);
      expect(container.read(sessionResetProvider), 'Sesión cerrada.');
    },
  );

  test('lectura de tema demorada no escribe en el scope destruido', () async {
    const channel = MethodChannel(
      'plugins.it_nomads.com/flutter_secure_storage',
    );
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    final started = Completer<void>();
    final response = Completer<String>();
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'read');
      started.complete();
      return response.future;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final container = ProviderContainer();
    final loading = container.read(temaControllerProvider.notifier).cargar();
    await started.future;
    container.dispose();
    response.complete('oscuro');
    await loading;
  });

  testWidgets(
    'reinicio elimina carrito, UUID, familia, formulario y Navigator',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final tokens = _Tokens();
      final conectividad = _ConectividadFake();
      final containers = <ProviderContainer>[];
      final lateResponse = Completer<http.Response>();
      final lateStarted = Completer<void>();
      var tenant = 'casa';
      var familyReads = 0;
      final family = Provider.family<int, String>((ref, id) => ++familyReads);
      await tester.pumpWidget(
        SessionBoundary(
          overrides: [
            tokenStoreProvider.overrideWithValue(tokens),
            sharedPreferencesProvider.overrideWithValue(prefs),
            conectividadServiceProvider.overrideWithValue(conectividad),
            apiClientProvider.overrideWith((ref) {
              final api = _api((request) async {
                if (request.url.path.endsWith('/anterior')) {
                  lateStarted.complete();
                  return lateResponse.future;
                }
                if (request.url.path.endsWith('/session')) {
                  return _session(tenant: tenant);
                }
                if (request.url.path.endsWith('/usar')) {
                  tenant = 'centro';
                  return http.Response('{}', 200);
                }
                return http.Response('{"message":"sin red"}', 503);
              });
              ref.onDispose(api.close);
              return api;
            }),
            catalogoProvider.overrideWith(
              (ref) async => const Catalogo(productos: [], version: null),
            ),
            tenantProvider.overrideWith(
              (ref) async =>
                  const IdentidadTenant(nombre: 'Puesto', bajada: ''),
            ),
          ],
          child: Consumer(
            builder: (context, ref, _) {
              final container = ProviderScope.containerOf(context);
              if (!containers.contains(container)) containers.add(container);
              return const MostradorApp();
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final before = containers.single;
      final router = before.read(routerProvider);
      expect(before.read(family('detalle')), 1);
      final cart = before.read(carritoControllerProvider.notifier);
      cart.agregar(
        const Producto(
          id: 'p_1',
          nombre: 'Pera',
          unidad: 'kg',
          unidadLabel: 'kg',
          precio: 100,
          stock: 5,
          stockMinimo: 0,
          alias: [],
          activo: true,
          stockBajo: false,
        ),
      );
      final confirm = cart.confirmar();
      await tester.pumpAndSettle();
      await confirm;
      expect(before.read(carritoControllerProvider).clientUuid, isNotNull);
      unawaited(
        showDialog<void>(
          context: router.routerDelegate.navigatorKey.currentContext!,
          builder: (context) => const AlertDialog(
            content: TextField(
              decoration: InputDecoration(labelText: 'Borrador anterior'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'dato de casa');
      final obsolete = expectLater(
        before.read(apiClientProvider).get('/api/v1/anterior'),
        throwsA(isA<ContextChangedException>()),
      );
      await tester.pump();
      await lateStarted.future;
      final changing = before
          .read(authControllerProvider.notifier)
          .cambiarSucursal('suc_1');
      await tester.pumpAndSettle();
      await changing;
      lateResponse.complete(http.Response('{}', 401));
      await tester.pump();
      await obsolete;
      expect(tokens.clears, 0);
      expect(tokens.value, 'test-session');
      expect(containers.length, 2);
      final after = containers.last;
      expect(after.read(authControllerProvider).sesion!.tenantId, 'centro');
      expect(after.read(carritoControllerProvider).vacio, isTrue);
      expect(after.read(carritoControllerProvider).clientUuid, isNull);
      expect(after.read(family('detalle')), 2);
      expect(after.read(routerProvider), isNot(same(router)));
      expect(find.text('dato de casa'), findsNothing);
      expect(find.text('Borrador anterior'), findsNothing);
      expect(find.text('Cambio de sucursal confirmado.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'cambio tardío tras timeout rechaza operaciones de los libros anteriores',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final tokens = _Tokens();
      final containers = <ProviderContainer>[];
      final usar = Completer<http.Response>();
      var tenant = 'casa';
      var mutations = 0;
      await tester.pumpWidget(
        SessionBoundary(
          overrides: [
            tokenStoreProvider.overrideWithValue(tokens),
            sharedPreferencesProvider.overrideWithValue(prefs),
            apiClientProvider.overrideWith((ref) {
              final api = _api((request) async {
                if (request.url.path.endsWith('/session')) {
                  return _session(tenant: tenant);
                }
                if (request.url.path.endsWith('/usar')) return usar.future;
                if (request.headers['x-mostrador-tenant'] != tenant) {
                  return http.Response(
                    '{"error":"contexto_desactualizado"}',
                    409,
                  );
                }
                mutations++;
                return http.Response('{}', 200);
              }, timeout: const Duration(milliseconds: 100));
              ref.onDispose(api.close);
              return api;
            }),
            catalogoProvider.overrideWith(
              (ref) async => const Catalogo(productos: [], version: null),
            ),
            tenantProvider.overrideWith(
              (ref) async =>
                  const IdentidadTenant(nombre: 'Puesto', bajada: ''),
            ),
            suscripcionProvider.overrideWith(
              (ref) async => SuscripcionResumen(
                plan: PlanSuscripcion(codigo: 'basic', nombre: 'Básico'),
                estado: 'active',
                addons: const [],
                pendiente: const PendienteAceptacion(hayPendiente: false),
                pendientes: const [],
              ),
            ),
          ],
          child: Consumer(
            builder: (context, ref, _) {
              final container = ProviderScope.containerOf(context);
              if (!containers.contains(container)) containers.add(container);
              return const MostradorApp();
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final changing = containers.single
          .read(authControllerProvider.notifier)
          .cambiarSucursal('suc_1');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 101));
      await tester.pumpAndSettle();
      await changing;
      expect(containers.length, 2);
      expect(
        containers.last.read(authControllerProvider).sesion!.tenantId,
        'casa',
      );
      tenant = 'centro';
      usar.complete(http.Response('{}', 200));
      await tester.pump();
      final rejected = expectLater(
        containers.last.read(apiClientProvider).post('/api/v1/pedidos'),
        throwsA(isA<ContextChangedException>()),
      );
      await tester.pumpAndSettle();
      await rejected;
      expect(mutations, 0);
      expect(containers.length, 3);
      expect(
        containers.last.read(authControllerProvider).sesion!.tenantId,
        'centro',
      );
      final accepted = containers.last
          .read(apiClientProvider)
          .post('/api/v1/pedidos');
      await tester.pumpAndSettle();
      await accepted;
      expect(mutations, 1);
      expect(tokens.clears, 0);
      expect(tester.takeException(), isNull);
    },
  );
}
