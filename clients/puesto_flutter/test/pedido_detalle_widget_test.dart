import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/pedidos/pedido_detalle_screen.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _PedidosFake implements PedidosService {
  _PedidosFake(this.pedido);

  Pedido pedido;
  ApiException? entregarError;
  int entregas = 0;

  @override
  Future<void> entregar(String id) async {
    entregas++;
    final fallo = entregarError;
    if (fallo != null) throw fallo;
    pedido = _pedido(id, estado: PedidoEstado.entregado);
  }

  @override
  Future<Pedido> detalle(String id) async => pedido;

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async => [pedido];

  @override
  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? nota,
  }) async =>
      throw UnimplementedError();

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
  Future<Ticket> ticket(String cobroId) async => throw UnimplementedError();
}

Pedido _pedido(String id, {required PedidoEstado estado}) => Pedido(
      id: id,
      clientUuid: 'uuid-$id',
      vendedorId: 'stf_venta',
      vendedorNombre: 'Venta',
      clienteId: null,
      clienteNombre: 'Mostrador',
      estado: estado,
      nota: null,
      items: const [],
      total: 0,
      createdAt: '',
      updatedAt: '',
      formaPago: null,
      comprobanteNombre: null,
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

Future<void> _montar(WidgetTester tester, _PedidosFake fake) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [pedidosServiceProvider.overrideWithValue(fake)],
    child: const MaterialApp(
      home: PedidoDetalleScreen(pedidoId: 'ped_1'),
    ),
  ));
  await _esperar(tester, find.byKey(const Key('pedido_detalle')));
}

/// Confirma la entrega desde el diálogo tocando el botón dos veces sin
/// `pump` intermedio (taps repetidos en el mismo frame).
Future<void> _confirmarDobleTap(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('pedido_entregar')));
  await _esperar(tester, find.byKey(const Key('entrega_confirmar')));
  await tester.tap(find.byKey(const Key('entrega_confirmar')));
  // Tras el primer tap el diálogo ya se está cerrando; el segundo tap no
  // debe producir otra petición (warnIfMissed: el diálogo ya no es hittable).
  await tester.tap(find.byKey(const Key('entrega_confirmar')), warnIfMissed: false);
}

Future<void> _drenarSnackBar(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pedido no cobrado: no ofrece entrega', (tester) async {
    final fake = _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    await _montar(tester, fake);
    expect(find.byKey(const Key('pedido_entregar')), findsNothing);
    expect(find.byKey(const Key('entrega_error')), findsNothing);
    expect(find.text('Enviado'), findsOneWidget);
  });

  testWidgets('pedido cobrado: confirma en diálogo y entrega una sola vez',
      (tester) async {
    final fake = _PedidosFake(_pedido('ped_1', estado: PedidoEstado.cobrado));
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('pedido_entregar')));

    await _confirmarDobleTap(tester);
    await _esperar(tester, find.text('Entregado'));

    expect(fake.entregas, 1,
        reason: 'el doble tap no debe provocar dos peticiones');
    expect(find.byKey(const Key('pedido_entregar')), findsNothing,
        reason: 'ya entregado: el estado releído del backend oculta el botón');
    expect(find.byKey(const Key('entrega_error')), findsNothing);
    await _drenarSnackBar(tester);
  });

  testWidgets('cancelar el diálogo no llama al backend', (tester) async {
    final fake = _PedidosFake(_pedido('ped_1', estado: PedidoEstado.cobrado));
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('pedido_entregar')));

    await tester.tap(find.byKey(const Key('pedido_entregar')));
    await _esperar(tester, find.byKey(const Key('entrega_cancelar')));
    await tester.tap(find.byKey(const Key('entrega_cancelar')));
    await tester.pumpAndSettle();

    expect(fake.entregas, 0);
    expect(find.byKey(const Key('pedido_entregar')), findsOneWidget);
  });

  testWidgets('error de entrega: avisa, conserva el pedido y desbloquea',
      (tester) async {
    final fake = _PedidosFake(_pedido('ped_1', estado: PedidoEstado.cobrado));
    fake.entregarError = ServerException('Falla simulada del servidor.');
    await _montar(tester, fake);
    await _esperar(tester, find.byKey(const Key('pedido_entregar')));

    await _confirmarDobleTap(tester);
    await _esperar(tester, find.byKey(const Key('entrega_error')));

    expect(fake.entregas, 1);
    expect(find.text('Falla simulada del servidor.'), findsOneWidget);
    expect(find.text('Cobrado'), findsOneWidget,
        reason: 'el estado mostrado no se altera artificialmente');
    final boton = tester.widget<FilledButton>(
      find.byKey(const Key('pedido_entregar')),
    );
    expect(boton.onPressed, isNotNull,
        reason: 'tras el error el usuario puede reintentar');
  });
}
