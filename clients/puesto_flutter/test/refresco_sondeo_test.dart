import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/refresco.dart';
import 'package:puesto_flutter/core/tema.dart';
import 'package:puesto_flutter/features/admin/alertas_pane.dart';
import 'package:puesto_flutter/models/alerta.dart';
import 'package:puesto_flutter/services/alertas_service.dart';

/// El mismo canal `flutter/lifecycle` que usa el motor de Windows cuando la
/// ventana pierde el foco, se minimiza o vuelve a pantalla.
Future<void> _cicloDeVida(WidgetTester tester, AppLifecycleState estado) async {
  final ByteData? mensaje = const StringCodec().encodeMessage(estado.toString());
  await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .handlePlatformMessage('flutter/lifecycle', mensaje, (_) {});
  await tester.pump();
}

/// `pumpAndSettle` no sirve mientras hay spinners ni sondeos; se va frame a
/// frame hasta que el finder aparece.
Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  int intentos = 50,
}) async {
  for (var i = 0; i < intentos; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No apareció en pantalla: $finder');
}

class _Pantalla extends StatefulWidget {
  const _Pantalla({required this.intervalo, required this.sobreRefrescar});

  final Duration? intervalo;
  final VoidCallback sobreRefrescar;

  @override
  State<_Pantalla> createState() => _PantallaState();
}

class _PantallaState extends State<_Pantalla>
    with RefrescoAutomatico<_Pantalla> {
  @override
  Duration? get intervalo => widget.intervalo;

  @override
  void refrescar() => widget.sobreRefrescar();

  @override
  Widget build(BuildContext context) => const Scaffold();
}

class _AlertasFake implements AlertasService {
  _AlertasFake(this.alertas);

  List<Alerta> alertas;
  int llamadas = 0;

  @override
  Future<List<Alerta>> listar() async {
    llamadas++;
    return alertas;
  }

  @override
  Future<void> marcarLeida(String id) async {}
}

Alerta _alerta(String id) => Alerta(
      id: id,
      tipo: 'stock_bajo',
      mensaje: 'Queda poca mercadería de $id',
      leida: false,
      creada: '2026-10-01 10:00:00+00',
    );

/// El `invalidate` rearma el provider en un microtask y el `Future` resuelve en
/// otro, así que se bombeo hasta que la bandeja vuelva a tener filas.
Future<void> _esperarLlamadas(
  WidgetTester tester,
  _AlertasFake fake,
  int esperadas,
) async {
  for (var i = 0; i < 30 && fake.llamadas < esperadas; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(fake.llamadas, esperadas,
      reason: 'la bandeja se releyó las veces previstas');
}

void main() {
  group('RefrescoAutomatico', () {
    testWidgets('sondea mientras la pantalla está montada', (tester) async {
      var llamadas = 0;
      await tester.pumpWidget(MaterialApp(
        home: _Pantalla(
          intervalo: const Duration(seconds: 15),
          sobreRefrescar: () => llamadas++,
        ),
      ));

      expect(llamadas, 0, reason: 'el montaje ya carga solo');

      await tester.pump(const Duration(seconds: 15));
      expect(llamadas, 1);

      await tester.pump(const Duration(seconds: 15));
      expect(llamadas, 2, reason: 'el sondeo es periódico, no de una sola vez');
    });

    testWidgets('intervalo null deja el sondeo congelado', (tester) async {
      var llamadas = 0;
      await tester.pumpWidget(MaterialApp(
        home: _Pantalla(
          intervalo: null,
          sobreRefrescar: () => llamadas++,
        ),
      ));

      await tester.pump(const Duration(minutes: 10));
      expect(llamadas, 0, reason: 'los widget tests congelan el Timer.periodic');
    });

    testWidgets('volver del fondo refresca una sola vez', (tester) async {
      var llamadas = 0;
      await tester.pumpWidget(MaterialApp(
        home: _Pantalla(
          intervalo: null,
          sobreRefrescar: () => llamadas++,
        ),
      ));

      await _cicloDeVida(tester, AppLifecycleState.inactive);
      expect(llamadas, 0, reason: 'perder el foco no gasta una ida al backend');

      await _cicloDeVida(tester, AppLifecycleState.resumed);
      expect(llamadas, 1, reason: 'el refresco inmediato no depende del sondeo');

      await _cicloDeVida(tester, AppLifecycleState.resumed);
      expect(llamadas, 1, reason: 'el mismo estado no vuelve a disparar');

      await _cicloDeVida(tester, AppLifecycleState.hidden);
      await _cicloDeVida(tester, AppLifecycleState.resumed);
      expect(llamadas, 2,
          reason: 'restaurar la ventana minimizada también refresca');
    });

    testWidgets('ir al fondo no refresca', (tester) async {
      var llamadas = 0;
      await tester.pumpWidget(MaterialApp(
        home: _Pantalla(
          intervalo: null,
          sobreRefrescar: () => llamadas++,
        ),
      ));

      await _cicloDeVida(tester, AppLifecycleState.inactive);
      await _cicloDeVida(tester, AppLifecycleState.hidden);
      expect(llamadas, 0, reason: 'en fondo no se gasta una ida al backend');
    });

    testWidgets('al desmontar no queda timer ni observador', (tester) async {
      var llamadas = 0;
      await tester.pumpWidget(MaterialApp(
        home: _Pantalla(
          intervalo: const Duration(seconds: 15),
          sobreRefrescar: () => llamadas++,
        ),
      ));
      await tester.pump(const Duration(seconds: 15));
      expect(llamadas, 1);

      await tester.pumpWidget(const MaterialApp(home: Scaffold()));
      await tester.pump(const Duration(minutes: 5));
      expect(llamadas, 1, reason: 'dispose() cancela el Timer.periodic');

      await _cicloDeVida(tester, AppLifecycleState.inactive);
      await _cicloDeVida(tester, AppLifecycleState.resumed);
      expect(llamadas, 1, reason: 'dispose() desregistra el listener');
    });
  });

  group('AlertasPane', () {
    Future<_AlertasFake> montar(
      WidgetTester tester, {
      required Duration? intervalo,
    }) async {
      final fake = _AlertasFake([_alerta('alr_1')]);
      await tester.pumpWidget(ProviderScope(
        overrides: [alertasServiceProvider.overrideWithValue(fake)],
        child: MaterialApp(
          theme: temaClaro(),
          home: Scaffold(body: AlertasPane(intervalo: intervalo)),
        ),
      ));
      await _esperar(tester, find.byKey(const Key('alertas_lista')));
      expect(fake.llamadas, 1, reason: 'la primera carga la hace el provider');
      return fake;
    }

    testWidgets('relee las alertas al volver del fondo', (tester) async {
      final fake = await montar(tester, intervalo: null);

      await _cicloDeVida(tester, AppLifecycleState.inactive);
      expect(fake.llamadas, 1, reason: 'mientras está en fondo no se sondea');

      await _cicloDeVida(tester, AppLifecycleState.resumed);
      await _esperarLlamadas(tester, fake, 2);
      await _esperar(tester, find.byKey(const Key('alertas_lista')));
    });

    testWidgets('la alerta nueva aparece sin tocar nada', (tester) async {
      final fake = await montar(tester, intervalo: const Duration(seconds: 30));
      fake.alertas = [_alerta('alr_2'), ...fake.alertas];

      await tester.pump(const Duration(seconds: 30));
      await _esperarLlamadas(tester, fake, 2);

      expect(find.text('Queda poca mercadería de alr_2'), findsOneWidget);
    });
  });
}
