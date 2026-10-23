import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:puesto_flutter/core/network/api_client.dart';
import 'package:puesto_flutter/features/admin/clientes_app_pane.dart';
import 'package:puesto_flutter/models/comprador_app.dart';
import 'package:puesto_flutter/services/compradores_app_service.dart';

CompradoresAppService _servicio(MockClient mock) => CompradoresAppService(
      ApiClient(
        baseUrl: 'http://api.test',
        tokenProvider: () async => 'tok-1',
        httpClient: mock,
        timeout: const Duration(seconds: 5),
      ),
    );

/// Respuesta del backend con clientes propios y compradores Mercado.
Map<String, dynamic> _respuestaClientes() => {
      'data': [
        {
          'id': 'cli_1',
          'nombre': 'Almacen Centro',
          'telefono': '1144556677',
          'email': 'almacen@test.com',
          'cuentaCorriente': true,
          'condicionIva': 'ri',
          'activo': true,
          'saldo': 0,
          'origen': 'puesto',
        },
        {
          'id': 'merc:buyer_1',
          'nombre': 'Juan Perez',
          'telefono': '1122334455',
          'email': 'juan@test.com',
          'cuentaCorriente': false,
          'condicionIva': 'consumidor_final',
          'activo': true,
          'saldo': 0,
          'origen': 'mercado',
          'userId': 'user_1',
        },
        {
          'id': 'merc:buyer_2',
          'nombre': 'Maria Lopez',
          'email': 'maria@test.com',
          'cuentaCorriente': false,
          'condicionIva': 'consumidor_final',
          'activo': true,
          'saldo': 0,
          'origen': 'mercado',
          'userId': 'user_2',
        },
      ],
    };

void main() {
  group('CompradoresAppService', () {
    test('listar filtra solo los compradores de origen mercado', () async {
      final servicio = _servicio(MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/api/v1/clientes');
        return http.Response(
          jsonEncode(_respuestaClientes()),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final compradores = await servicio.listar();

      expect(compradores.length, 2);
      expect(compradores[0].id, 'user_1');
      expect(compradores[0].nombre, 'Juan Perez');
      expect(compradores[0].email, 'juan@test.com');
      expect(compradores[0].telefono, '1122334455');
      expect(compradores[1].id, 'user_2');
      expect(compradores[1].nombre, 'Maria Lopez');
    });

    test('listar devuelve lista vacia si no hay compradores Mercado',
        () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'cli_1',
                'nombre': 'Almacen Centro',
                'origen': 'puesto',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final compradores = await servicio.listar();
      expect(compradores, isEmpty);
    });

    test('obtener devuelve el comprador por ID o null si no existe',
        () async {
      final servicio = _servicio(MockClient((request) async {
        return http.Response(
          jsonEncode(_respuestaClientes()),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }));

      final encontrado = await servicio.obtener('user_1');
      expect(encontrado, isNotNull);
      expect(encontrado!.nombre, 'Juan Perez');

      final noEncontrado = await servicio.obtener('user_inexistente');
      expect(noEncontrado, isNull);
    });
  });

  group('CompradorApp.fromJson', () {
    test('parsea todos los campos del JSON', () {
      final json = {
        'id': 'user_1',
        'nombre': 'Juan Perez',
        'email': 'juan@test.com',
        'telefono': '1122334455',
        'totalPedidos': 5,
        'totalGastado': 12500.50,
        'primeraCompra': '2026-01-15 10:00:00',
        'ultimaCompra': '2026-10-20 14:30:00',
        'verificado': true,
        'identidad': 'aprobada',
      };

      final comprador = CompradorApp.fromJson(json);
      expect(comprador.id, 'user_1');
      expect(comprador.nombre, 'Juan Perez');
      expect(comprador.email, 'juan@test.com');
      expect(comprador.telefono, '1122334455');
      expect(comprador.totalPedidos, 5);
      expect(comprador.totalGastado, 12500.50);
      expect(comprador.primeraCompra, '2026-01-15 10:00:00');
      expect(comprador.ultimaCompra, '2026-10-20 14:30:00');
      expect(comprador.verificado, isTrue);
      expect(comprador.identidad, 'aprobada');
    });

    test('usa valores por defecto para campos opcionales ausentes', () {
      final json = {'id': 'user_2', 'nombre': 'Maria Lopez'};
      final comprador = CompradorApp.fromJson(json);
      expect(comprador.email, isNull);
      expect(comprador.telefono, isNull);
      expect(comprador.totalPedidos, 0);
      expect(comprador.totalGastado, 0);
      expect(comprador.verificado, isFalse);
      expect(comprador.identidad, 'sin_documento');
    });
  });

  group('ClientesAppPane', () {
    late MockClient httpClient;

    setUp(() {
      httpClient = MockClient((request) async {
        if (request.method == 'GET' &&
            request.url.path == '/api/v1/clientes') {
          return http.Response(
            jsonEncode(_respuestaClientes()),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('', 404);
      });
    });

    Future<void> abrirPane(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final apiClient = ApiClient(
        baseUrl: 'http://api.test',
        tokenProvider: () async => 'tok-1',
        httpClient: httpClient,
        timeout: const Duration(seconds: 5),
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [apiClientProvider.overrideWithValue(apiClient)],
          child: const MaterialApp(
            home: Scaffold(body: ClientesAppPane()),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('muestra la lista de compradores Mercado', (tester) async {
      await abrirPane(tester);

      expect(find.byKey(const Key('clientes_app_lista')), findsOneWidget);
      expect(find.text('Juan Perez'), findsOneWidget);
      expect(find.text('Maria Lopez'), findsOneWidget);
      // El cliente de puesto NO aparece
      expect(find.text('Almacen Centro'), findsNothing);
    });

    testWidgets('muestra estadisticas con total de compradores',
        (tester) async {
      await abrirPane(tester);

      // Hay 2 compradores
      expect(find.text('2'), findsWidgets);
    });

    testWidgets('filtra por busqueda de nombre', (tester) async {
      await abrirPane(tester);

      await tester.enterText(
        find.byKey(const Key('clientes_app_busqueda')),
        'Juan',
      );
      await tester.pumpAndSettle();

      expect(find.text('Juan Perez'), findsOneWidget);
      expect(find.text('Maria Lopez'), findsNothing);
    });

    testWidgets('muestra mensaje cuando no hay resultados', (tester) async {
      await abrirPane(tester);

      await tester.enterText(
        find.byKey(const Key('clientes_app_busqueda')),
        'Inexistente',
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Ningun comprador coincide con la busqueda.'),
        findsOneWidget,
      );
    });

    testWidgets('abre dialog de detalle al tocar un comprador',
        (tester) async {
      await abrirPane(tester);

      await tester.tap(find.byKey(const Key('comprador_app_user_1')));
      await tester.pumpAndSettle();

      expect(find.text('Juan Perez'), findsNWidgets(2)); // tile + dialog
      expect(find.text('juan@test.com'), findsWidgets);
      expect(find.text('Cerrar'), findsOneWidget);
    });
  });
}
