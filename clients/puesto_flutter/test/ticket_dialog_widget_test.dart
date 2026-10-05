import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/caja/ticket_dialog.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';
import 'package:puesto_flutter/services/printer_service.dart';

class _PedidosFake implements PedidosService {
  _PedidosFake(this.ticketResult);

  final Future<Ticket> Function(String cobroId) ticketResult;

  @override
  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? nota,
  }) async =>
      throw UnimplementedError();

  @override
  Future<Pedido> detalle(String id) async => throw UnimplementedError();

  @override
  Future<void> entregar(String id) async => throw UnimplementedError();

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async =>
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
  Future<Ticket> ticket(String cobroId) => ticketResult(cobroId);
}

class _PrinterFake implements PrinterService {
  _PrinterFake({this.error});

  final Object? error;
  final List<Ticket> impresos = [];

  @override
  Future<void> imprimirTicket(Ticket ticket) async {
    impresos.add(ticket);
    final fallo = error;
    if (fallo != null) throw fallo;
  }
}

const _ticketJson = {
  'id': 'tck_1',
  'numero': 7,
  'createdAt': '2026-10-04T10:00:00Z',
  'contenido': {
    'puesto': 'Puesto 1',
    'numero': 7,
    'fecha': '2026-10-04T10:00:00Z',
    'cliente': 'Consumidor final',
    'items': [
      {
        'nombre': 'Manzana',
        'cantidad': 1.5,
        'unidad': 'kg',
        'precio': 500,
        'subtotal': 750,
      },
    ],
    'total': 750,
    'formaPago': 'efectivo',
    'recibido': 1000,
    'vuelto': 250,
    'pie': 'Gracias por su compra',
  },
};

Future<void> _pumpDialog(
  WidgetTester tester, {
  required PedidosService pedidos,
  required PrinterService printer,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        pedidosServiceProvider.overrideWithValue(pedidos),
        printerServiceProvider.overrideWithValue(printer),
      ],
      child: const MaterialApp(
        home: Scaffold(body: TicketDialog(cobroId: 'cob_1')),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('imprimir: pasa el ticket cargado al PrinterService', (tester) async {
    final pedidos = _PedidosFake((cobroId) async => Ticket.fromJson(_ticketJson));
    final printer = _PrinterFake();
    await _pumpDialog(tester, pedidos: pedidos, printer: printer);

    expect(find.byKey(const Key('ticket_contenido')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ticket_imprimir')));
    await tester.pumpAndSettle();

    expect(printer.impresos, hasLength(1));
    expect(printer.impresos.single.numero, 7);
    expect(printer.impresos.single.contenido.total, 750);
  });

  testWidgets('imprimir: sin ticket cargado el botón queda deshabilitado',
      (tester) async {
    final pedidos = _PedidosFake(
      (cobroId) async => throw const ApiException('boom'),
    );
    final printer = _PrinterFake();
    await _pumpDialog(tester, pedidos: pedidos, printer: printer);

    final boton = tester.widget<FilledButton>(
      find.byKey(const Key('ticket_imprimir')),
    );
    expect(boton.onPressed, isNull, reason: 'sin datos no se puede imprimir');
    expect(printer.impresos, isEmpty);
  });

  testWidgets('imprimir: el fallo se avisa sin cerrar el diálogo', (tester) async {
    final pedidos = _PedidosFake((cobroId) async => Ticket.fromJson(_ticketJson));
    final printer = _PrinterFake(error: Exception('sin impresora'));
    await _pumpDialog(tester, pedidos: pedidos, printer: printer);

    await tester.tap(find.byKey(const Key('ticket_imprimir')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('ticket_dialogo')), findsOneWidget);
    expect(find.text('No se pudo abrir la impresión.'), findsOneWidget);
  });
}
