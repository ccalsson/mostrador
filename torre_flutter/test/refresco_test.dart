import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show StringCodec, SystemChannels;
import 'package:flutter_test/flutter_test.dart';
import 'package:torre_flutter/src/widgets.dart';

class _Carga {
  int llamadas = 0;
  bool falla = false;

  Future<int> cargar() async {
    llamadas++;
    if (falla) throw StateError('corte de red');
    return llamadas;
  }
}

Widget _vista(
  _Carga carga, {
  bool autoRefrescar = true,
  Duration? intervalo = const Duration(seconds: 5),
}) =>
    MaterialApp(
      home: Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1200),
                child: VistaDatos<int>(
                  autoRefrescar: autoRefrescar,
                  intervalo: intervalo,
                  cargar: carga.cargar,
                  builder: (context, datos) => Text('datos $datos'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

Future<void> _abrir(WidgetTester tester, Widget consola) async {
  await tester.pumpWidget(consola);
  await tester.pump();
}

Future<void> _estado(WidgetTester tester, AppLifecycleState estado) async {
  await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.handlePlatformMessage(
    SystemChannels.lifecycle.name,
    const StringCodec().encodeMessage(estado.toString()),
    (_) {},
  );
  await tester.pump();
}

void main() {
  testWidgets('refresca sola cada intervalo', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga));
    expect(carga.llamadas, 1);

    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(carga.llamadas, 2);
    expect(find.text('datos 2'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(carga.llamadas, 3);
  });

  testWidgets('autoRefrescar en falso no refresca solo', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga, autoRefrescar: false));

    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
    }
    expect(carga.llamadas, 1);
    expect(find.textContaining('sin refresco automático'), findsOneWidget);
  });

  testWidgets('intervalo nulo no refresca solo', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga, intervalo: null));
    await tester.pump(const Duration(minutes: 2));
    await tester.pump();
    expect(carga.llamadas, 1);
  });

  testWidgets('tirar abajo refresca dentro del scroll de la consola', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga, autoRefrescar: false));
    expect(find.text('datos 1'), findsOneWidget);

    await tester.drag(find.text('datos 1'), const Offset(0, 200));
    await tester.pumpAndSettle();
    expect(carga.llamadas, 2);
    expect(find.text('datos 2'), findsOneWidget);
  });

  testWidgets('refresca al recuperar la ventana y no lo hace sin foco', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga));

    await _estado(tester, AppLifecycleState.inactive);
    await _estado(tester, AppLifecycleState.resumed);
    expect(carga.llamadas, 2);
    expect(find.text('datos 2'), findsOneWidget);

    await _estado(tester, AppLifecycleState.inactive);
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(carga.llamadas, 2);

    await _estado(tester, AppLifecycleState.resumed);
    expect(carga.llamadas, 3);
  });

  testWidgets('muestra la antigüedad de los datos', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga));
    expect(find.textContaining(RegExp(r'^hace \d+s$')), findsOneWidget);

    carga.falla = true;
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(find.textContaining('error al refrescar'), findsOneWidget);
  });

  testWidgets('un fallo de refresco en fondo no borra lo cargado', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga));

    carga.falla = true;
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(carga.llamadas, 2);
    expect(find.text('datos 1'), findsOneWidget);
    expect(find.text('Reintentar'), findsNothing);

    carga.falla = false;
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(find.text('datos 3'), findsOneWidget);
    expect(find.textContaining('error al refrescar'), findsNothing);
  });

  testWidgets('el primer fallo mantiene el error con Reintentar', (tester) async {
    final carga = _Carga()..falla = true;
    await _abrir(tester, _vista(carga));
    expect(find.textContaining('corte de red'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
    expect(find.text('datos 1'), findsNothing);

    carga.falla = false;
    await tester.tap(find.text('Reintentar'));
    await tester.pump();
    await tester.pump();
    expect(find.text('datos 2'), findsOneWidget);
  });

  testWidgets('cancela el refresco automático al desmontar', (tester) async {
    final carga = _Carga();
    await _abrir(tester, _vista(carga));

    await tester.pumpWidget(Container());
    await tester.pump(const Duration(minutes: 5));
    expect(carga.llamadas, 1);
  });
}
