import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/format.dart';
import 'package:puesto_flutter/features/caja/caja_pane.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _PedidosFake implements PedidosService {
  _PedidosFake(this.pedidos);

  List<Pedido> pedidos;
  ApiException? cobrarError;
  final List<String?> estadosConsultados = [];
  final List<String> cobroUuids = [];
  final List<FormaPago> formas = [];
  final List<double?> recibidos = [];
  final List<({String id, List<({String productoId, double cantidad})> items})>
      ediciones = [];
  int detalleLlamadas = 0;

  Pedido _buscar(String id) => pedidos.firstWhere((p) => p.id == id);

  void _reemplazar(String id, Pedido nuevo) {
    pedidos = [for (final p in pedidos) p.id == id ? nuevo : p];
  }

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async {
    estadosConsultados.add(estados);
    final filtro = estados?.split(',');
    return [
      for (final p in pedidos)
        if (filtro == null || filtro.contains(_apiEstado(p.estado))) p,
    ];
  }

  @override
  Future<Pedido> detalle(String id) async {
    detalleLlamadas++;
    return _buscar(id);
  }

  @override
  Future<CobroResultado> cobrar(
    String id, {
    required String clientUuid,
    required FormaPago formaPago,
    double? montoRecibido,
  }) async {
    cobroUuids.add(clientUuid);
    formas.add(formaPago);
    recibidos.add(montoRecibido);
    final fallo = cobrarError;
    if (fallo != null) throw fallo;
    final pedido = _buscar(id);
    _reemplazar(id, _copia(pedido, estado: PedidoEstado.cobrado));
    return CobroResultado(
      cobroId: 'cob_1',
      ticketId: 'tck_1',
      numero: 7,
      vuelto: 123.45,
      total: pedido.total,
    );
  }

  @override
  Future<Pedido> actualizarItems(
    String id,
    List<({String productoId, double cantidad})> items,
  ) async {
    ediciones.add((id: id, items: items));
    final previo = _buscar(id);
    var total = 0.0;
    final nuevos = <PedidoItem>[];
    for (final linea in items) {
      final base = previo.items.firstWhere(
        (it) => it.productoId == linea.productoId,
      );
      final subtotal = redondear2(base.precioUnitario * linea.cantidad);
      total += subtotal;
      nuevos.add(PedidoItem(
        id: base.id,
        productoId: base.productoId,
        nombre: base.nombre,
        cantidad: linea.cantidad,
        precioUnitario: base.precioUnitario,
        unidad: base.unidad,
        unidadLabel: base.unidadLabel,
        subtotal: subtotal,
      ));
    }
    final actualizado =
        _copia(previo, items: nuevos, total: redondear2(total));
    _reemplazar(id, actualizado);
    return actualizado;
  }

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

String _apiEstado(PedidoEstado estado) => switch (estado) {
      PedidoEstado.borrador => 'borrador',
      PedidoEstado.enviado => 'enviado',
      PedidoEstado.enPreparacion => 'en_preparacion',
      PedidoEstado.listo => 'listo',
      PedidoEstado.cobrado => 'cobrado',
      PedidoEstado.anulado => 'anulado',
      PedidoEstado.entregado => 'entregado',
    };

PedidoItem _item(
  String productoId, {
  String nombre = 'Manzana',
  double cantidad = 1,
  double precio = 100,
  String unidadLabel = 'kg',
}) =>
    PedidoItem(
      id: 'itm_$productoId',
      productoId: productoId,
      nombre: nombre,
      cantidad: cantidad,
      precioUnitario: precio,
      unidad: 'kg',
      unidadLabel: unidadLabel,
      subtotal: redondear2(precio * cantidad),
    );

Pedido _pedido(
  String id, {
  PedidoEstado estado = PedidoEstado.enviado,
  double total = 0,
  List<PedidoItem> items = const [],
}) =>
    Pedido(
      id: id,
      clientUuid: 'uuid-$id',
      vendedorId: 'stf_venta',
      vendedorNombre: 'Venta',
      clienteId: null,
      clienteNombre: 'Mostrador',
      estado: estado,
      nota: null,
      items: items,
      total: total,
      createdAt: '2026-10-01 10:00:00+00',
      updatedAt: '',
      formaPago: null,
      comprobanteNombre: null,
    );

Pedido _copia(
  Pedido p, {
  PedidoEstado? estado,
  List<PedidoItem>? items,
  double? total,
}) =>
    Pedido(
      id: p.id,
      clientUuid: p.clientUuid,
      vendedorId: p.vendedorId,
      vendedorNombre: p.vendedorNombre,
      clienteId: p.clienteId,
      clienteNombre: p.clienteNombre,
      estado: estado ?? p.estado,
      nota: p.nota,
      items: items ?? p.items,
      total: total ?? p.total,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      formaPago: p.formaPago,
      comprobanteNombre: p.comprobanteNombre,
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

Future<void> _esperarSin(
  WidgetTester tester,
  Finder finder, {
  int intentos = 50,
}) async {
  for (var i = 0; i < intentos; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isEmpty) return;
  }
  fail('No desapareció de pantalla: $finder');
}

Future<void> _montar(WidgetTester tester, _PedidosFake fake) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [pedidosServiceProvider.overrideWithValue(fake)],
    child: const MaterialApp(
      home: Scaffold(body: CajaPane()),
    ),
  ));
  await _esperar(tester, find.byKey(const Key('caja_lista')));
}

Future<void> _abrirDetalle(WidgetTester tester, String id) async {
  await tester.tap(find.byKey(Key('caja_tile_$id')));
  await _esperar(tester, find.byKey(const Key('caja_detalle')));
}

Future<void> _drenarSnackBar(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump();
}

void main() {
  testWidgets('recepción: carga, selección y acciones del pedido a cobrar',
      (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    await _montar(tester, fake);

    expect(fake.estadosConsultados.first, 'borrador,enviado,en_preparacion,listo',
        reason: 'el filtro inicial pide sólo estados por cobrar');
    expect(find.byKey(const Key('caja_sin_seleccion')), findsOneWidget);

    await _abrirDetalle(tester, 'ped_1');

    expect(find.byKey(const Key('caja_sin_seleccion')), findsNothing);
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Enviado',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_total'))).data,
      'Total: \$1500,00',
    );
    expect(find.text('1 × \$1500,00 / kg'), findsOneWidget);
    expect(find.byKey(const Key('caja_cobrar')), findsOneWidget);
    expect(find.byKey(const Key('caja_editar_items')), findsOneWidget);
  });

  testWidgets('pedido cobrado: sin acciones de cobro ni edición', (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1'),
      _pedido('ped_2', estado: PedidoEstado.cobrado),
    ]);
    await _montar(tester, fake);
    expect(find.byKey(const Key('caja_tile_ped_2')), findsNothing,
        reason: 'el filtro por cobrar excluye los cobrados');

    await tester.tap(find.text('Cobrados'));
    await _esperar(tester, find.byKey(const Key('caja_tile_ped_2')));
    expect(fake.estadosConsultados.contains('cobrado,entregado'), isTrue);
    expect(find.byKey(const Key('caja_tile_ped_1')), findsNothing);

    await _abrirDetalle(tester, 'ped_2');
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Cobrado',
    );
    expect(find.byKey(const Key('caja_cobrar')), findsNothing);
    expect(find.byKey(const Key('caja_editar_items')), findsNothing);
  });

  testWidgets('cobro en efectivo: vuelto estimado local y vuelto real del backend',
      (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    await _montar(tester, fake);
    await _abrirDetalle(tester, 'ped_1');

    await tester.tap(find.byKey(const Key('caja_cobrar')));
    await _esperar(tester, find.byKey(const Key('cobro_dialogo')));

    expect(
      tester.widget<Text>(find.byKey(const Key('cobro_total'))).data,
      'Total: \$1500,00',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('cobro_vuelto'))).data,
      '\$0,00',
      reason: 'con el total como importe inicial no hay vuelto',
    );

    await tester.enterText(find.byKey(const Key('cobro_recibido')), '2000');
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('cobro_vuelto'))).data,
      '\$500,00',
      reason: 'estimación local mientras se completa el formulario',
    );

    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    await _esperar(tester, find.byKey(const Key('caja_cobro_exito')));

    expect(find.byKey(const Key('cobro_dialogo')), findsNothing);
    expect(
      find.text('Total: \$1500,00 · Vuelto: \$123,45'),
      findsOneWidget,
      reason: 'tras cobrar manda el vuelto real del backend, no la estimación',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Cobrado',
      reason: 'el detalle se relee del backend, sin transición local ficticia',
    );
    expect(fake.detalleLlamadas, greaterThanOrEqualTo(2));
    expect(find.byKey(const Key('caja_cobrar')), findsNothing);
    expect(fake.cobroUuids.length, 1);
    expect(fake.formas.single, FormaPago.efectivo);
    expect(fake.recibidos.single, 2000.0);
  });

  testWidgets('error de cobro: avisa en el diálogo y conserva el pedido',
      (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    fake.cobrarError = ValidationException('Solo se cobra un pedido pendiente.');
    await _montar(tester, fake);
    await _abrirDetalle(tester, 'ped_1');

    await tester.tap(find.byKey(const Key('caja_cobrar')));
    await _esperar(tester, find.byKey(const Key('cobro_dialogo')));
    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    await _esperar(tester, find.byKey(const Key('cobro_error')));

    expect(find.byKey(const Key('cobro_dialogo')), findsOneWidget,
        reason: 'el diálogo sigue abierto para reintentar o cancelar');
    expect(find.text('Solo se cobra un pedido pendiente.'), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Enviado',
      reason: 'un cobro fallido no altera el estado mostrado',
    );
    final boton = tester.widget<FilledButton>(
      find.byKey(const Key('cobro_confirmar')),
    );
    expect(boton.onPressed, isNotNull,
        reason: 'tras el error el usuario puede reintentar');
    expect(fake.cobroUuids.length, 1);

    await tester.tap(find.byKey(const Key('cobro_cancelar')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cobro_dialogo')), findsNothing);
    expect(fake.cobroUuids.length, 1, reason: 'cancelar no cobra');
  });

  testWidgets('doble confirmación: un solo cobro', (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    await _montar(tester, fake);
    await _abrirDetalle(tester, 'ped_1');

    await tester.tap(find.byKey(const Key('caja_cobrar')));
    await _esperar(tester, find.byKey(const Key('cobro_dialogo')));

    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    // Segundo tap en el mismo frame: el botón aún no se reconstruyó, pero el
    // guard del controller descarta el envío duplicado.
    await tester.tap(
      find.byKey(const Key('cobro_confirmar')),
      warnIfMissed: false,
    );
    await _esperar(tester, find.byKey(const Key('caja_cobro_exito')));

    expect(fake.cobroUuids.length, 1,
        reason: 'el mismo clic no debe generar dos cobros');
  });

  testWidgets('edición de ítems: total estimado local y total real del backend',
      (tester) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 100, items: [_item('p1', precio: 100)]),
    ]);
    await _montar(tester, fake);
    await _abrirDetalle(tester, 'ped_1');
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_total'))).data,
      'Total: \$100,00',
    );

    await tester.tap(find.byKey(const Key('caja_editar_items')));
    await _esperar(tester, find.byKey(const Key('items_dialogo')));

    await tester.enterText(find.byKey(const Key('items_cantidad_p1')), '3');
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('items_total_estimado'))).data,
      'Total estimado: \$300,00',
    );

    await tester.tap(find.byKey(const Key('items_guardar')));
    await _esperar(tester, find.byKey(const Key('items_confirmar')));
    await tester.tap(find.byKey(const Key('items_confirmar_aceptar')));

    await _esperar(tester, find.text('Ítems actualizados.'));
    expect(fake.ediciones.single.id, 'ped_1');
    expect(fake.ediciones.single.items.single.productoId, 'p1');
    expect(fake.ediciones.single.items.single.cantidad, 3.0);
    await _esperarSin(tester, find.byKey(const Key('items_dialogo')));

    await _esperar(tester, find.text('Total: \$300,00'));
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_total'))).data,
      'Total: \$300,00',
      reason: 'el total definitivo lo recalcula el backend',
    );
    await _drenarSnackBar(tester);
  });
}
