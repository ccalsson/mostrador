import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/shell/legal_gate.dart';
import 'package:puesto_flutter/models/staff_session.dart';
import 'package:puesto_flutter/models/suscripcion.dart';
import 'package:puesto_flutter/services/suscripcion_service.dart';

/// Resumen sin documentos pendientes: el gate debe pasar al child.
SuscripcionResumen _resumenSinPendientes() => SuscripcionResumen(
      plan: const PlanSuscripcion(codigo: 'base', nombre: 'Base'),
      estado: 'activa',
      addons: const [],
      pendiente: const PendienteAceptacion(hayPendiente: false),
      pendientes: const [],
    );

/// Resumen con dos documentos pendientes de aceptación.
SuscripcionResumen _resumenConPendientes() => SuscripcionResumen(
      plan: const PlanSuscripcion(codigo: 'base', nombre: 'Base'),
      estado: 'activa',
      addons: const [],
      pendiente: const PendienteAceptacion(hayPendiente: false),
      pendientes: const [
        DocumentoPendiente(
          documentoId: 'uso_app',
          version: 2,
          hash: 'sha256:aaa',
          titulo: 'Condiciones de uso de la app',
        ),
        DocumentoPendiente(
          documentoId: 'addons_servicios',
          version: 1,
          hash: 'sha256:bbb',
          titulo: 'Add-ons y servicios',
        ),
      ],
    );

/// Child de prueba para verificar que el gate pasa al shell.
const _testChildKey = Key('test_child');
const _testChild = SizedBox(key: _testChildKey);

void main() {
  group('LegalGate', () {
    testWidgets('rol no-admin: pasa directo al child sin gate',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.vendedor, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // El child de prueba se renderiza (no hay bloqueo).
      expect(find.byKey(_testChildKey), findsOneWidget);
      // No aparece la pantalla de pendientes.
      expect(find.text('Documentos pendientes'), findsNothing);
    });

    testWidgets('rol cajero: pasa directo al child sin gate', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.cajero, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(_testChildKey), findsOneWidget);
      expect(find.text('Documentos pendientes'), findsNothing);
    });

    testWidgets('sin pendientes: muestra child directamente', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenSinPendientes(),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // No hay pantalla de bloqueo.
      expect(find.text('Documentos pendientes'), findsNothing);
      // El child se renderiza.
      expect(find.byKey(_testChildKey), findsOneWidget);
    });

    testWidgets('con pendientes: muestra pantalla de bloqueo', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Pantalla de bloqueo visible.
      expect(find.text('Documentos pendientes'), findsOneWidget);
      // El child NO se renderiza.
      expect(find.byKey(_testChildKey), findsNothing);
      // Ambos documentos aparecen.
      expect(find.text('Condiciones de uso de la app'), findsOneWidget);
      expect(find.text('Add-ons y servicios'), findsOneWidget);
      // Las versiones se muestran.
      expect(find.text('Versión 2'), findsOneWidget);
      expect(find.text('Versión 1'), findsOneWidget);
      // Botones de aceptar.
      expect(find.text('Aceptar y continuar'), findsNWidgets(2));
    });

    testWidgets('loading: muestra indicador de carga', (tester) async {
      final completer = Completer<SuscripcionResumen>();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) => completer.future,
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      // Un solo frame para que aparezca el loading.
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // El child no se renderiza mientras carga.
      expect(find.byKey(_testChildKey), findsNothing);

      // Resolver el completer para limpiar el timer.
      completer.complete(_resumenSinPendientes());
      await tester.pumpAndSettle();
    });

    testWidgets('error: muestra mensaje y botón reintentar', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => throw NetworkException('Sin conexión.'),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Error al cargar la suscripción.'), findsOneWidget);
      expect(find.byKey(const Key('legal_gate_reintentar')), findsOneWidget);
    });

    testWidgets('error 404: muestra mensaje específico', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => throw NotFoundException('Sin suscripción.'),
            ),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('La suscripción no está disponible todavía.'),
        findsOneWidget,
      );
    });

    testWidgets('al aceptar un documento se llama al servicio',
        (tester) async {
      final servicio = _MockSuscripcionService();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
            suscripcionServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Aceptar el primer documento (uso_app).
      await tester.tap(find.byKey(const Key('legal_aceptar_uso_app')));
      await tester.pumpAndSettle();

      expect(servicio.aceptados, hasLength(1));
      expect(servicio.aceptados.first.documentoId, 'uso_app');
      expect(servicio.aceptados.first.version, 2);
      expect(servicio.aceptados.first.hash, 'sha256:aaa');
    });

    testWidgets('al aceptar el segundo documento se llama con sus datos',
        (tester) async {
      final servicio = _MockSuscripcionService();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
            suscripcionServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Aceptar el segundo documento (addons_servicios).
      await tester.tap(
        find.byKey(const Key('legal_aceptar_addons_servicios')),
      );
      await tester.pumpAndSettle();

      expect(servicio.aceptados, hasLength(1));
      expect(servicio.aceptados.first.documentoId, 'addons_servicios');
      expect(servicio.aceptados.first.version, 1);
      expect(servicio.aceptados.first.hash, 'sha256:bbb');
    });

    testWidgets('error en aceptar: muestra SnackBar', (tester) async {
      final servicio = _MockSuscripcionService(
        failWith: NetworkException('Sin conexión.'),
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            suscripcionProvider.overrideWith(
              (ref) async => _resumenConPendientes(),
            ),
            suscripcionServiceProvider.overrideWithValue(servicio),
          ],
          child: const MaterialApp(
            home: LegalGate(rol: Rol.admin, child: _testChild),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('legal_aceptar_uso_app')));
      await tester.pumpAndSettle();

      expect(find.text('Sin conexión.'), findsOneWidget);
    });
  });

  group('DocumentoPendiente', () {
    test('aceptable con datos completos', () {
      const doc = DocumentoPendiente(
        documentoId: 'uso_app',
        version: 2,
        hash: 'sha256:abc',
      );
      expect(doc.aceptable, isTrue);
    });

    test('no aceptable con documentoId vacío', () {
      const doc = DocumentoPendiente(
        documentoId: '',
        version: 1,
        hash: 'sha256:abc',
      );
      expect(doc.aceptable, isFalse);
    });

    test('no aceptable con hash vacío', () {
      const doc = DocumentoPendiente(
        documentoId: 'uso_app',
        version: 1,
        hash: '',
      );
      expect(doc.aceptable, isFalse);
    });

    test('fromJson parsea correctamente', () {
      final doc = DocumentoPendiente.fromJson({
        'documentoId': 'addons_servicios',
        'version': 3,
        'hash': 'sha256:xyz',
        'titulo': 'Add-ons',
      });
      expect(doc.documentoId, 'addons_servicios');
      expect(doc.version, 3);
      expect(doc.hash, 'sha256:xyz');
      expect(doc.titulo, 'Add-ons');
      expect(doc.aceptable, isTrue);
    });

    test('fromJson sin titulo: titulo es null', () {
      final doc = DocumentoPendiente.fromJson({
        'documentoId': 'uso_app',
        'version': 1,
        'hash': 'sha256:abc',
      });
      expect(doc.titulo, isNull);
    });
  });

  group('SuscripcionResumen.pendientes', () {
    test('fromJson con lista de pendientes', () {
      final resumen = SuscripcionResumen.fromJson({
        'suscripcion': {
          'plan': {'codigo': 'base', 'nombre': 'Base'},
          'estado': 'activa',
        },
        'addons': <Object>[],
        'pendientes': [
          {
            'documentoId': 'uso_app',
            'version': 2,
            'hash': 'sha256:aaa',
            'titulo': 'Uso de la app',
          },
          {
            'documentoId': 'addons_servicios',
            'version': 1,
            'hash': 'sha256:bbb',
          },
        ],
      });
      expect(resumen.pendientes, hasLength(2));
      expect(resumen.pendientes[0].documentoId, 'uso_app');
      expect(resumen.pendientes[0].titulo, 'Uso de la app');
      expect(resumen.pendientes[1].documentoId, 'addons_servicios');
      expect(resumen.pendientes[1].titulo, isNull);
    });

    test('fromJson sin pendientes: lista vacía', () {
      final resumen = SuscripcionResumen.fromJson({
        'suscripcion': {
          'plan': {'codigo': 'base', 'nombre': 'Base'},
          'estado': 'activa',
        },
        'addons': <Object>[],
      });
      expect(resumen.pendientes, isEmpty);
    });

    test('fromJson con pendiente legacy (single): no afecta lista', () {
      final resumen = SuscripcionResumen.fromJson({
        'suscripcion': {
          'plan': {'codigo': 'base', 'nombre': 'Base'},
          'estado': 'activa',
        },
        'addons': <Object>[],
        'pendiente': {
          'hayPendiente': true,
          'documentoId': 'contrato-marco',
          'version': 4,
          'hash': 'sha256:def456',
        },
      });
      // El pendiente legacy se parsea correctamente.
      expect(resumen.pendiente.aceptable, isTrue);
      // La lista de pendientes está vacía si no viene "pendientes".
      expect(resumen.pendientes, isEmpty);
    });
  });
}

class _MockSuscripcionService implements SuscripcionService {
  _MockSuscripcionService({this.failWith});

  final ApiException? failWith;
  final List<({String documentoId, int version, String hash})> aceptados = [];

  @override
  Future<void> aceptarContrato({
    required String documentoId,
    required int version,
    required String hash,
  }) async {
    if (failWith != null) throw failWith!;
    aceptados.add(
      (documentoId: documentoId, version: version, hash: hash),
    );
  }

  // Los demás métodos no se usan en estos tests.
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}
