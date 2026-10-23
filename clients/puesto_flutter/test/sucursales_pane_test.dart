import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/auth/auth_controller.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/admin/sucursales_pane.dart';
import 'package:puesto_flutter/models/staff_session.dart';

class _Auth extends AuthController {
  _Auth({this.permission = true, this.protected = true});
  final bool permission;
  final bool protected;
  final changes = <String>[];

  @override
  AuthState build() => AuthState.authenticated(
    StaffSession(
      staff: Staff(
        id: 'stf_1',
        nombre: 'Operador',
        rol: Rol.admin,
        puedeCambiar: permission,
      ),
      tenantId: 'casa',
      casaId: 'casa',
      contextoProtegido: protected,
    ),
  );

  @override
  Future<void> cambiarSucursal(String id) async => changes.add(id);
}

class _Http {
  var reads = 0;
  bool full = false;
  bool reject = false;
  bool failRead = false;
  bool rejectImport = false;
  int importados = 5;
  final creates = <Map<String, dynamic>>[];
  final transfers = <Map<String, dynamic>>[];
  final imports = <String>[];

  Future<http.Response> call(http.Request request) async {
    final path = request.url.path;
    expect(request.headers['x-mostrador-tenant'], 'casa');
    if (request.method == 'GET' && path == '/api/v1/sucursales') {
      reads++;
      if (failRead) {
        return http.Response(
          '{"message":"sin conexión al panel"}',
          503,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      return http.Response(
        jsonEncode({
          'data': {
            'incluidas': 2,
            'extras': 1,
            'cupo': 3,
            'usadas': 2,
            'puedeCrear': !full,
            'esDueno': true,
            'sucursales': [
              {
                'id': 'matriz',
                'nombre': 'Principal',
                'referencia': '',
                'esMatriz': true,
                'activa': true,
                'esActual': true,
              },
              {
                'id': 'suc_1',
                'nombre': 'Centro',
                'referencia': 'Local 2',
                'esMatriz': false,
                'activa': true,
                'esActual': false,
              },
            ],
            'cruce': [
              {
                'id': 'matriz',
                'nombre': 'Principal',
                'ventas': 1250,
                'tickets': 4,
                'stockBajo': 2,
              },
              {
                'id': 'suc_1',
                'nombre': 'Centro',
                'ventas': 800,
                'tickets': 2,
                'stockBajo': 1,
              },
            ],
            'productos': [
              {'id': 'p_1', 'nombre': 'Pera de matriz', 'stock': 5},
            ],
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.method == 'POST' && path == '/api/v1/sucursales') {
      creates.add(jsonDecode(request.body) as Map<String, dynamic>);
      if (reject) return http.Response('{"message":"Cupo agotado"}', 400);
      return http.Response('{"data":{"id":"suc_2","productos":1}}', 201);
    }
    if (request.method == 'POST' &&
        path == '/api/v1/sucursales/suc_1/transferir') {
      transfers.add(jsonDecode(request.body) as Map<String, dynamic>);
      if (reject) return http.Response('{"message":"Stock insuficiente"}', 400);
      return http.Response('{"data":{"ok":true}}', 200);
    }
    if (request.method == 'POST' &&
        path == '/api/v1/sucursales/suc_1/importar-clientes') {
      imports.add('suc_1');
      if (rejectImport) {
        return http.Response('{"message":"Sucursal inactiva"}', 400);
      }
      return http.Response(
        jsonEncode({'data': {'importados': importados}}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    throw StateError('Request inesperado: ${request.method} $path');
  }
}

Future<_Auth> _open(
  WidgetTester tester,
  _Http backend,
  Size size, {
  bool permission = true,
  bool protected = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final auth = _Auth(permission: permission, protected: protected);
  final client = ApiClient(
    baseUrl: 'http://api.test',
    tokenProvider: () async => 'test-session',
    httpClient: MockClient(backend.call),
  )..bindTenant('casa');
  addTearDown(client.close);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        apiClientProvider.overrideWithValue(client),
        authControllerProvider.overrideWith(() => auth),
      ],
      child: MaterialApp(
        theme: temaClaro(),
        home: const Scaffold(body: SucursalesPane()),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return auth;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  for (final size in [const Size(390, 844), const Size(1200, 1000)]) {
    testWidgets('${size.width}: crear con referencia y releer cupo', (
      tester,
    ) async {
      final backend = _Http();
      await _open(tester, backend, size);
      expect(find.text('Sucursal activa: Casa matriz'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('sucursal_nueva')));
      await _tap(tester, find.byKey(const Key('sucursal_crear')));
      expect(backend.creates, isEmpty);
      await tester.enterText(
        find.byKey(const Key('sucursal_nombre')),
        ' Norte ',
      );
      await tester.enterText(
        find.byKey(const Key('sucursal_referencia')),
        ' Avenida 10 ',
      );
      await _tap(tester, find.byKey(const Key('sucursal_crear')));
      expect(backend.creates.single, {
        'nombre': 'Norte',
        'referencia': 'Avenida 10',
      });
      expect(backend.reads, 2);
      expect(
        find.text('Sucursal creada. 1 productos copiados sin stock.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      '${size.width}: transferencia valida cantidad y conserva origen matriz',
      (tester) async {
        final backend = _Http();
        await _open(tester, backend, size);
        await _tap(tester, find.byKey(const Key('sucursal_transferir_suc_1')));
        expect(find.text('Destino: Centro'), findsOneWidget);
        await _tap(tester, find.byKey(const Key('transferencia_producto')));
        await _tap(tester, find.text('Pera de matriz').last);
        expect(find.text('Stock en matriz: 5.0'), findsOneWidget);
        for (final cantidad in ['0', '8', 'NaN']) {
          await tester.enterText(
            find.byKey(const Key('transferencia_cantidad')),
            cantidad,
          );
          await _tap(tester, find.byKey(const Key('transferencia_confirmar')));
          expect(backend.transfers, isEmpty);
        }
        await tester.enterText(
          find.byKey(const Key('transferencia_cantidad')),
          '1,5',
        );
        await _tap(tester, find.byKey(const Key('transferencia_confirmar')));
        expect(backend.transfers.single, {
          'productoId': 'p_1',
          'cantidad': 1.5,
        });
        expect(backend.reads, 2);
        expect(
          find.text('Stock transferido desde casa matriz.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      '${size.width}: cambio requiere confirmar y cancelar no hace nada',
      (tester) async {
        final backend = _Http();
        final auth = await _open(tester, backend, size);
        await _tap(tester, find.byKey(const Key('sucursal_entrar_suc_1')));
        expect(find.textContaining('otros dispositivos'), findsOneWidget);
        await _tap(tester, find.text('Cancelar'));
        expect(auth.changes, isEmpty);
        await _tap(tester, find.byKey(const Key('sucursal_entrar_suc_1')));
        await _tap(tester, find.text('Cambiar sucursal'));
        expect(auth.changes, ['suc_1']);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('rechazo del backend no anuncia alta ni transferencia exitosa', (
    tester,
  ) async {
    final backend = _Http()..reject = true;
    await _open(tester, backend, const Size(390, 844));
    await _tap(tester, find.byKey(const Key('sucursal_nueva')));
    await tester.enterText(find.byKey(const Key('sucursal_nombre')), 'Norte');
    await _tap(tester, find.byKey(const Key('sucursal_crear')));
    expect(find.text('Cupo agotado'), findsOneWidget);
    expect(backend.reads, 1);
    expect(find.byType(SnackBar), findsNothing);
    await _tap(tester, find.text('Cancelar'));
    await _tap(tester, find.byKey(const Key('sucursal_transferir_suc_1')));
    await _tap(tester, find.byKey(const Key('transferencia_producto')));
    await _tap(tester, find.text('Pera de matriz').last);
    await tester.enterText(
      find.byKey(const Key('transferencia_cantidad')),
      '1',
    );
    await _tap(tester, find.byKey(const Key('transferencia_confirmar')));
    expect(find.text('Stock insuficiente'), findsOneWidget);
    expect(backend.reads, 1);
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('cupo agotado y protocolo ausente deshabilitan acciones', (
    tester,
  ) async {
    final backend = _Http()..full = true;
    await _open(tester, backend, const Size(390, 844), protected: false);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('sucursal_nueva')))
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const Key('sucursal_entrar_suc_1')),
          )
          .onPressed,
      isNull,
    );
    expect(
      find.textContaining('servidor necesita actualizarse'),
      findsOneWidget,
    );
  });

  testWidgets(
    'sin permiso no se ofrece cambio aunque el protocolo esté presente',
    (tester) async {
      await _open(tester, _Http(), const Size(390, 844), permission: false);
      expect(
        tester
            .widget<OutlinedButton>(
              find.byKey(const Key('sucursal_entrar_suc_1')),
            )
            .onPressed,
        isNull,
      );
      expect(
        find.text('No tenés habilitado el cambio de sucursal.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'error al leer permite reintentar y muestra comparación de 7 días',
    (tester) async {
      final backend = _Http()..failRead = true;
      await _open(tester, backend, const Size(1200, 1000));
      expect(find.text('sin conexión al panel'), findsOneWidget);
      backend.failRead = false;
      await _tap(tester, find.text('Reintentar'));
      expect(backend.reads, 2);
      expect(
        find.text('Cobrado y tickets: últimos 7 días. Stock bajo: actual.'),
        findsOneWidget,
      );
      expect(find.text('Tickets: 4'), findsOneWidget);
      expect(find.text('Productos con stock bajo: 2'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'importar clientes: botón solo en sucursales que no son la actual',
    (tester) async {
      final backend = _Http();
      await _open(tester, backend, const Size(1200, 1000));
      // La sucursal actual es "matriz" (Principal), no debe tener botón
      expect(
        find.byKey(const Key('sucursal_importar_matriz')),
        findsNothing,
      );
      // "suc_1" (Centro) sí debe tener botón
      expect(
        find.byKey(const Key('sucursal_importar_suc_1')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'importar clientes: confirmar, ejecutar y mostrar resultado',
    (tester) async {
      final backend = _Http()..importados = 12;
      await _open(tester, backend, const Size(1200, 1000));
      await _tap(
        tester,
        find.byKey(const Key('sucursal_importar_suc_1')),
      );
      // Debe aparecer el diálogo de confirmación
      expect(find.textContaining('Importar clientes de Centro'), findsOneWidget);
      // Cancelar no hace nada
      await _tap(tester, find.text('Cancelar'));
      expect(backend.imports, isEmpty);
      // Volver a abrir y confirmar
      await _tap(
        tester,
        find.byKey(const Key('sucursal_importar_suc_1')),
      );
      await _tap(tester, find.text('Importar'));
      // Esperar a que termine la operación
      await tester.pumpAndSettle();
      expect(backend.imports, ['suc_1']);
      // Debe mostrar el snackbar con el resultado
      expect(
        find.text('12 clientes importados desde Centro.'),
        findsOneWidget,
      );
      // Debe haber releído el panel de sucursales
      expect(backend.reads, 2);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'importar clientes: error del backend muestra mensaje',
    (tester) async {
      final backend = _Http()..rejectImport = true;
      await _open(tester, backend, const Size(1200, 1000));
      await _tap(
        tester,
        find.byKey(const Key('sucursal_importar_suc_1')),
      );
      await _tap(tester, find.text('Importar'));
      await tester.pumpAndSettle();
      expect(backend.imports, ['suc_1']);
      expect(find.text('Sucursal inactiva'), findsOneWidget);
      // No debe haber releído porque falló
      expect(backend.reads, 1);
    },
  );
}
