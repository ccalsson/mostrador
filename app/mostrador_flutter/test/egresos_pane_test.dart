import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mostrador_flutter/core/network/api_client.dart';
import 'package:mostrador_flutter/features/caja/caja_pane.dart';
import 'package:mostrador_flutter/providers.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient que devuelve datos controlados para los widget tests.
// ---------------------------------------------------------------------------

class _FakeApiClient implements ApiClient {
  _FakeApiClient();

  String? lastPath;

  @override
  String? get sessionToken => null;

  @override
  Future<ApiResponse> get(String path, {Map<String, String>? headers}) async {
    lastPath = path;
    return _FakeResponse(200, '{"items":[],"efectivo":0}');
  }

  @override
  Future<ApiResponse> post(String path,
      {Object? body, Map<String, String>? headers}) async {
    lastPath = path;
    return _FakeResponse(201, '{"ok":true}');
  }

  @override
  Future<ApiResponse> put(String path,
      {Object? body, Map<String, String>? headers}) async {
    lastPath = path;
    return _FakeResponse(200, '{"ok":true}');
  }

  @override
  Future<ApiResponse> delete(String path,
      {Map<String, String>? headers}) async {
    lastPath = path;
    return _FakeResponse(200, '{"ok":true}');
  }
}

class _FakeResponse implements ApiResponse {
  _FakeResponse(this.statusCode, this.body);
  @override
  final int statusCode;
  @override
  final String body;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ---------------------------------------------------------------------------
// Helper para montar widgets con ProviderScope y un ApiClient falso.
// ---------------------------------------------------------------------------

Widget buildTestApp({required ApiClient client}) {
  return ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(client),
    ],
    child: const MaterialApp(
      home: Scaffold(body: CajaPane()),
    ),
  );
}

void main() {
  group('CajaPane widget', () {
    testWidgets('muestra "Egresos del turno" al cargar', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump(); // microtask para cargar

      expect(find.text('Egresos del turno'), findsOneWidget);
      expect(find.text('Estado de caja'), findsOneWidget);
    });

    testWidgets('muestra mensaje vacío cuando no hay egresos', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Sin egresos en este turno.'), findsOneWidget);
    });

    testWidgets('muestra botón "Nuevo egreso"', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      expect(find.text('Nuevo egreso'), findsOneWidget);
    });

    testWidgets('formulario aparece al tocar "Nuevo egreso"', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      await tester.tap(find.text('Nuevo egreso'));
      await tester.pumpAndSettle();

      expect(find.text('Nuevo egreso'), findsNWidgets(2));
      expect(find.text('Categoría'), findsOneWidget);
      expect(find.text('Concepto'), findsOneWidget);
      expect(find.text('Monto'), findsOneWidget);
      expect(find.text('Medio'), findsOneWidget);
    });

    testWidgets('valida concepto vacío en formulario', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      await tester.tap(find.text('Nuevo egreso'));
      await tester.pumpAndSettle();

      // Intentar guardar sin llenar nada
      await tester.tap(find.text('Anotar egreso'));
      await tester.pumpAndSettle();

      expect(find.text('Decí en qué se fue'), findsOneWidget);
    });

    testWidgets('valida monto vacío en formulario', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      await tester.tap(find.text('Nuevo egreso'));
      await tester.pumpAndSettle();

      // Llenar concepto pero no monto
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Concepto'), 'Algo');
      await tester.tap(find.text('Anotar egreso'));
      await tester.pumpAndSettle();

      expect(find.text('El monto es obligatorio'), findsOneWidget);
    });

    testWidgets('muestra "Esperado = Cobrado − Egresos efectivo"',
        (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      expect(
          find.text('Esperado = Cobrado − Egresos efectivo'), findsOneWidget);
    });

    testWidgets('muestra nota sobre efectivo vs transferencia', (tester) async {
      final fake = _FakeApiClient();
      await tester.pumpWidget(buildTestApp(client: fake));
      await tester.pump();

      expect(
        find.text(
            'En efectivo sale de la caja. Transferencia u otro queda en el negocio.'),
        findsOneWidget,
      );
    });
  });

  group('EgresoCategoria', () {
    test('tiene 7 categorías con id y label', () {
      expect(categoriasEgreso.length, 7);
      final ids = categoriasEgreso.map((c) => c.id).toSet();
      expect(
          ids,
          containsAll([
            'alquiler',
            'combustible',
            'servicios',
            'proveedores',
            'mercaderia',
            'sueldos',
            'otros'
          ]));
    });
  });

  group('MedioPago', () {
    test('medioPagoLabel devuelve labels correctos', () {
      expect(medioPagoLabel(MedioPago.efectivo), 'Efectivo');
      expect(medioPagoLabel(MedioPago.transferencia), 'Transferencia');
      expect(medioPagoLabel(MedioPago.otro), 'Otro');
    });
  });
}
