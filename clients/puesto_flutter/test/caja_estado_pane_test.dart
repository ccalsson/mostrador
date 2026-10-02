import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/caja/caja_estado_pane.dart';
import 'package:puesto_flutter/features/caja/caja_pane.dart';
import 'package:puesto_flutter/models/caja.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/caja_service.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _CajaFake implements CajaService {
  _CajaFake(this.estadoPara);

  final Future<CajaEstado> Function(int llamada) estadoPara;
  var llamadas = 0;

  @override
  Future<CajaEstado> estado() {
    llamadas++;
    return estadoPara(llamadas);
  }
}

class _CajaPendiente implements CajaService {
  @override
  Future<CajaEstado> estado() => Completer<CajaEstado>().future;
}

/// Para el selector de vista: la lista de pedidos queda vacía; los demás
/// métodos no se usan en estos tests.
class _PedidosVacioFake implements PedidosService {
  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async => [];

  @override
  Future<Pedido> detalle(String id) async => throw UnimplementedError();

  @override
  Future<CobroResultado> cobrar(
    String id, {
    required String clientUuid,
    required FormaPago formaPago,
    double? montoRecibido,
  }) async =>
      throw UnimplementedError();

  @override
  Future<Pedido> actualizarItems(
    String id,
    List<({String productoId, double cantidad})> items,
  ) async =>
      throw UnimplementedError();

  @override
  Future<void> entregar(String id) async => throw UnimplementedError();

  @override
  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? nota,
  }) async =>
      throw UnimplementedError();

  @override
  Future<Ticket> ticket(String cobroId) async => throw UnimplementedError();
}

UltimoCobro _cobro(String id, {double monto = 7200, int? numero = 1090}) =>
    UltimoCobro(
      id: id,
      monto: monto,
      formaPagoApi: 'efectivo',
      createdAt: '2026-10-02 02:50:04.142348+00',
      cliente: 'Mostrador E2E',
      numero: numero,
      facturaId: null,
      cae: null,
    );

CajaEstado _estado({
  double esperado = 79200,
  List<TotalFormaPago>? totales,
  List<UltimoCobro>? ultimos,
}) =>
    CajaEstado(
      id: 'cje_396ce29d87ac47a7',
      abiertoAt: '2026-10-01 22:27:06.909015+00',
      esperado: esperado,
      totales: totales ??
          const [TotalFormaPago(formaPagoApi: 'efectivo', total: 79200, n: 11)],
      ultimos: ultimos ?? [_cobro('cob_1')],
    );

/// `pumpAndSettle` no sirve mientras hay spinners; se sondea el frame.
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

Future<void> _montarEstado(WidgetTester tester, CajaService fake) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [cajaServiceProvider.overrideWithValue(fake)],
    child: const MaterialApp(home: Scaffold(body: CajaEstadoPane())),
  ));
  await tester.pump();
}

void main() {
  testWidgets('loading: spinner mientras el backend responde', (tester) async {
    await _montarEstado(tester, _CajaPendiente());

    expect(find.byKey(const Key('caja_estado_cargando')), findsOneWidget);
    expect(find.byKey(const Key('caja_estado_contenido')), findsNothing);
  });

  testWidgets('estado cargado: muestra los valores reales del backend',
      (tester) async {
    final fake = _CajaFake((_) async => _estado(
          ultimos: [_cobro('cob_1'), _cobro('cob_2', monto: 500, numero: null)],
        ));
    await _montarEstado(tester, fake);
    await _esperar(tester, find.byKey(const Key('caja_estado_contenido')));

    expect(
      tester.widget<Text>(find.byKey(const Key('caja_estado_abierto'))).data,
      'Turno abierto desde: 2026-10-01 22:27',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_estado_id'))).data,
      'Caja: cje_396ce29d87ac47a7',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_estado_esperado'))).data,
      'Esperado en caja: \$79200,00',
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('caja_estado_total_efectivo')),
        matching: find.text('\$79200,00 · 11 cobros'),
      ),
      findsOneWidget,
    );

    final fila1 = find.byKey(const Key('caja_mov_fila_cob_1'));
    expect(
      find.descendant(of: fila1, matching: find.text('2026-10-02 02:50')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila1, matching: find.text('Mostrador E2E')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila1, matching: find.text('Efectivo')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila1, matching: find.text('Nº 1090')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: fila1, matching: find.text('\$7200,00')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('caja_mov_fila_cob_2')),
        matching: find.text('—'),
      ),
      findsOneWidget,
      reason: 'sin ticket asociado el número no se inventa',
    );
  });

  testWidgets('turno sin cobros: estados vacíos explícitos', (tester) async {
    final fake = _CajaFake(
      (_) async => _estado(esperado: 0, totales: const [], ultimos: const []),
    );
    await _montarEstado(tester, fake);
    await _esperar(tester, find.byKey(const Key('caja_estado_sin_totales')));

    expect(find.byKey(const Key('caja_estado_contenido')), findsOneWidget);
    expect(find.byKey(const Key('caja_estado_sin_movimientos')), findsOneWidget);
  });

  testWidgets('error: mensaje del backend y reintento explícito', (tester) async {
    final fake = _CajaFake((llamada) async {
      if (llamada == 1) {
        throw ForbiddenException('No tenés permiso para esta acción.');
      }
      return _estado(esperado: 1500);
    });
    await _montarEstado(tester, fake);
    await _esperar(tester, find.byKey(const Key('caja_estado_reintentar')));

    expect(find.text('No tenés permiso para esta acción.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('caja_estado_reintentar')));
    await _esperar(tester, find.text('Esperado en caja: \$1500,00'));

    expect(fake.llamadas, 2);
    expect(find.byKey(const Key('caja_estado_reintentar')), findsNothing);
  });

  testWidgets('refrescar: vuelve a consultar el backend y actualiza',
      (tester) async {
    final fake = _CajaFake(
      (llamada) async => _estado(esperado: llamada == 1 ? 100 : 222),
    );
    await _montarEstado(tester, fake);
    await _esperar(tester, find.text('Esperado en caja: \$100,00'));

    await tester.tap(find.byKey(const Key('caja_estado_refrescar')));
    await _esperar(tester, find.text('Esperado en caja: \$222,00'));

    expect(fake.llamadas, 2);
  });

  testWidgets('selector de vista: Pedidos por defecto, ida y vuelta',
      (tester) async {
    final caja = _CajaFake((_) async => _estado());
    await tester.pumpWidget(ProviderScope(
      overrides: [
        pedidosServiceProvider.overrideWithValue(_PedidosVacioFake()),
        cajaServiceProvider.overrideWithValue(caja),
      ],
      child: const MaterialApp(home: Scaffold(body: CajaPane())),
    ));
    await _esperar(tester, find.byKey(const Key('caja_filtro')));

    expect(find.byKey(const Key('caja_estado_contenido')), findsNothing);
    expect(caja.llamadas, 0,
        reason: 'la vista de pedidos no consulta el estado de caja');

    await tester.tap(find.text('Estado de caja'));
    await _esperar(tester, find.byKey(const Key('caja_estado_contenido')));

    expect(find.byKey(const Key('caja_filtro')), findsNothing);
    expect(caja.llamadas, 1);

    await tester.tap(find.text('Pedidos'));
    await _esperar(tester, find.byKey(const Key('caja_filtro')));

    expect(find.byKey(const Key('caja_estado_contenido')), findsNothing);
  });
}
