import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/features/shell/mesa_turno_widget.dart';
import 'package:puesto_flutter/models/mesa_turno.dart';
import 'package:puesto_flutter/services/mesa_turno_service.dart';

class _MesaTurnoFake implements MesaTurnoService {
  _MesaTurnoFake(this._datos);
  final Future<MesaTurno> _datos;

  @override
  Future<MesaTurno> obtener() => _datos;
}

Widget _app({
  required MesaTurnoService servicio,
  required Widget child,
}) {
  return ProviderScope(
    overrides: [mesaTurnoServiceProvider.overrideWithValue(servicio)],
    child: MaterialApp(home: Scaffold(body: child)),
  );
}

void main() {
  testWidgets('muestra los 5 indicadores con datos correctos', (tester) async {
    final fake = _MesaTurnoFake(Future.value(const MesaTurno(
      cobrado: 125000.50,
      enCurso: 3,
      stockBajo: 5,
      pedidosApp: 2,
      publicados: 48,
    )));

    await tester.pumpWidget(_app(
      servicio: fake,
      child: const MesaTurnoWidget(),
    ));
    await tester.pumpAndSettle();

    // Verifica que los 5 indicadores están presentes.
    expect(find.byKey(const Key('mesa_cobrado')), findsOneWidget);
    expect(find.byKey(const Key('mesa_en_curso')), findsOneWidget);
    expect(find.byKey(const Key('mesa_stock_bajo')), findsOneWidget);
    expect(find.byKey(const Key('mesa_pedidos_app')), findsOneWidget);
    expect(find.byKey(const Key('mesa_publicados')), findsOneWidget);

    // Verifica los valores mostrados.
    expect(find.text('3'), findsOneWidget); // enCurso
    expect(find.text('5'), findsOneWidget); // stockBajo
    expect(find.text('2'), findsOneWidget); // pedidosApp
    expect(find.text('48'), findsOneWidget); // publicados

    // Verifica las etiquetas.
    expect(find.text('Cobrado'), findsOneWidget);
    expect(find.text('En curso'), findsOneWidget);
    expect(find.text('Stock bajo'), findsOneWidget);
    expect(find.text('Pedidos app'), findsOneWidget);
    expect(find.text('En Mercado'), findsOneWidget);
  });

  testWidgets('muestra loading mientras carga', (tester) async {
    // Un future que nunca se completa simula el estado de carga.
    final fake = _MesaTurnoFake(Completer<MesaTurno>().future);

    await tester.pumpWidget(_app(
      servicio: fake,
      child: const MesaTurnoWidget(),
    ));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('muestra error con botón reintentar', (tester) async {
    final fake = _MesaTurnoError(Exception('fallo de red'));

    await tester.pumpWidget(_app(
      servicio: fake,
      child: const MesaTurnoWidget(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('No se pudo cargar la mesa del turno.'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
  });

  testWidgets('el botón refresh invalida el provider', (tester) async {
    var llamadas = 0;
    final fake = _MesaTurnoFakeConContador(() {
      llamadas++;
      return Future.value(MesaTurno.vacio);
    });

    await tester.pumpWidget(_app(
      servicio: fake,
      child: const MesaTurnoWidget(),
    ));
    await tester.pumpAndSettle();

    expect(llamadas, 1);

    await tester.tap(find.byKey(const Key('mesa_turno_refresh')));
    await tester.pumpAndSettle();

    expect(llamadas, 2);
  });
}

class _MesaTurnoError implements MesaTurnoService {
  _MesaTurnoError(this._error);
  final Object _error;

  @override
  Future<MesaTurno> obtener() async => throw _error;
}

/// Fake con contador de llamadas para verificar invalidación.
class _MesaTurnoFakeConContador implements MesaTurnoService {
  _MesaTurnoFakeConContador(this._factory);
  final Future<MesaTurno> Function() _factory;

  @override
  Future<MesaTurno> obtener() => _factory();
}
