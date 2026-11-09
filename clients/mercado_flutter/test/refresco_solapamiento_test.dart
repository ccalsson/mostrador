import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mercado_al_toque/refresco.dart';
import 'package:mercado_al_toque/screens/courier_screen.dart';

import 'refresco_fixtures.dart';

/// Lleva la app de primer plano a segundo plano y de vuelta, como al volver de
/// un llamado.
Future<void> volverDeSegundoPlano(WidgetTester tester) async {
  final binding = tester.binding;
  binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
  binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('El sondeo y el pull-to-refresh comparten una sola recarga', (
    tester,
  ) async {
    final api = ApiFake(puestos: [puestoFijo]);
    await tester.pumpWidget(puestosScreen(api, refrescoPuestos));
    await tester.pumpAndSettle();
    expect(api.puestosLlamadas, 1);

    final freno = Completer<void>();
    api.freno = freno;
    await tester.drag(find.byType(ListView).first, const Offset(0, 300));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(api.puestosLlamadas, 2);

    await tester.pump(const Duration(seconds: 45));
    expect(api.puestosLlamadas, 2);

    api.freno = null;
    freno.complete();
    await tester.pumpAndSettle();
    expect(api.puestosLlamadas, 2);
  });

  testWidgets('Al volver de segundo plano el cargador ve su recorrido nuevo', (
    tester,
  ) async {
    final api = ApiFake();
    await tester.pumpWidget(
      anclado(
        CourierScreen(
          api: api,
          actor: cargadorActor(),
          refrescoCada: Duration.zero,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Todavía no tenés recorridos.'), findsOneWidget);

    api.recorridos = [recorrido()];
    await volverDeSegundoPlano(tester);

    expect(find.text('Aceptar'), findsOneWidget);
    expect(api.recorridosLlamadas, 2);
  });

  testWidgets('Refrescador no apila recargas ni timer después de detener', (
    tester,
  ) async {
    var llamadas = 0;
    final freno = Completer<void>();
    final refrescador = Refrescador(
      intervalo: const Duration(seconds: 5),
      onRefresco: () async {
        llamadas++;
        await freno.future;
      },
    );

    final primera = refrescador.ejecutar();
    await refrescador.ejecutar();
    expect(llamadas, 1);

    await tester.pump(const Duration(seconds: 5));
    expect(llamadas, 1);

    refrescador.detener();
    refrescador.detener();
    await tester.pump(const Duration(seconds: 30));

    freno.complete();
    await primera;
    expect(llamadas, 1);
  });

  testWidgets('Al volver de segundo plano refresca aunque no haya timer', (
    tester,
  ) async {
    var llamadas = 0;
    final refrescador = Refrescador(
      intervalo: Duration.zero,
      onRefresco: () async => llamadas++,
    );

    await volverDeSegundoPlano(tester);
    expect(llamadas, 1);

    refrescador.detener();
    await volverDeSegundoPlano(tester);
    expect(llamadas, 1);
  });
}
