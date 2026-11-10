import 'dart:typed_data';

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

  /// Retardo artificial para simular un backend lento durante el sondeo.
  Duration retraso = Duration.zero;
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
    if (retraso > Duration.zero) await Future<void>.delayed(retraso);
    final filtro = estados?.split(',');
    return [
      for (final p in pedidos)
        if (filtro == null || filtro.contains(_apiEstado(p.estado))) p,
    ];
  }

  @override
  Future<Pedido> detalle(String id) async {
    detalleLlamadas++;
    if (retraso > Duration.zero) await Future<void>.delayed(retraso);
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
      nuevos.add(
        PedidoItem(
          id: base.id,
          productoId: base.productoId,
          nombre: base.nombre,
          cantidad: linea.cantidad,
          precioUnitario: base.precioUnitario,
          unidad: base.unidad,
          unidadLabel: base.unidadLabel,
          subtotal: subtotal,
        ),
      );
    }
    final actualizado = _copia(previo, items: nuevos, total: redondear2(total));
    _reemplazar(id, actualizado);
    return actualizado;
  }

  @override
  Future<void> entregar(String id) async => throw UnimplementedError();

  @override
  Future<Pedido> actualizarEstado(String id, PedidoEstado estado) async =>
      throw UnimplementedError();

  @override
  Future<Pedido> entregarParcial(
    String id, {
    required List<({String itemId, double cantidad, String? nota})> items,
  }) async => throw UnimplementedError();

  @override
  Future<Uint8List> comprobante(String pedidoId) async =>
      throw UnimplementedError();

  @override
  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? clienteId,
    String? nota,
  }) async => throw UnimplementedError();

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
}) => PedidoItem(
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
}) => Pedido(
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
}) => Pedido(
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

Future<void> _montar(
  WidgetTester tester,
  _PedidosFake fake, {
  Duration? intervalo,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [pedidosServiceProvider.overrideWithValue(fake)],
      child: MaterialApp(
        home: Scaffold(body: CajaPane(intervalo: intervalo)),
      ),
    ),
  );
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
  testWidgets('recepción: carga, selección y acciones del pedido a cobrar', (
    tester,
  ) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    await _montar(tester, fake);

    expect(
      fake.estadosConsultados.first,
      'borrador,enviado,en_preparacion,listo',
      reason: 'el filtro inicial pide sólo estados por cobrar',
    );
    expect(find.byKey(const Key('caja_sin_seleccion')), findsOneWidget);

    await _abrirDetalle(tester, 'ped_1');

    expect(find.byKey(const Key('caja_sin_seleccion')), findsNothing);
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Enviado',
    );
    expect(
      tester
          .widget<MontoOculto>(find.byKey(const Key('caja_detalle_total')))
          .monto,
      1500.0,
    );
    expect(find.text('1 × \$1500,00 / kg'), findsOneWidget);
    expect(find.byKey(const Key('caja_cobrar')), findsOneWidget);
    expect(find.byKey(const Key('caja_editar_items')), findsOneWidget);
  });

  testWidgets('pedido cobrado: sin acciones de cobro ni edición', (
    tester,
  ) async {
    final fake = _PedidosFake([
      _pedido('ped_1'),
      _pedido('ped_2', estado: PedidoEstado.cobrado),
    ]);
    await _montar(tester, fake);
    expect(
      find.byKey(const Key('caja_tile_ped_2')),
      findsNothing,
      reason: 'el filtro por cobrar excluye los cobrados',
    );

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

  testWidgets(
    'cobro en efectivo: vuelto estimado local y vuelto real del backend',
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
        find.text('\$1500,00'),
        findsAtLeastNWidgets(1),
        reason: 'el monto total se muestra con MontoOculto',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
        'Cobrado',
        reason:
            'el detalle se relee del backend, sin transición local ficticia',
      );
      expect(fake.detalleLlamadas, greaterThanOrEqualTo(2));
      expect(find.byKey(const Key('caja_cobrar')), findsNothing);
      expect(fake.cobroUuids.length, 1);
      expect(fake.formas.single, FormaPago.efectivo);
      expect(fake.recibidos.single, 2000.0);
    },
  );

  testWidgets('error de cobro: avisa en el diálogo y conserva el pedido', (
    tester,
  ) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ]);
    fake.cobrarError = ValidationException(
      'Solo se cobra un pedido pendiente.',
    );
    await _montar(tester, fake);
    await _abrirDetalle(tester, 'ped_1');

    await tester.tap(find.byKey(const Key('caja_cobrar')));
    await _esperar(tester, find.byKey(const Key('cobro_dialogo')));
    await tester.tap(find.byKey(const Key('cobro_confirmar')));
    await _esperar(tester, find.byKey(const Key('cobro_error')));

    expect(
      find.byKey(const Key('cobro_dialogo')),
      findsOneWidget,
      reason: 'el diálogo sigue abierto para reintentar o cancelar',
    );
    expect(find.text('Solo se cobra un pedido pendiente.'), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('caja_detalle_estado'))).data,
      'Enviado',
      reason: 'un cobro fallido no altera el estado mostrado',
    );
    final boton = tester.widget<FilledButton>(
      find.byKey(const Key('cobro_confirmar')),
    );
    expect(
      boton.onPressed,
      isNotNull,
      reason: 'tras el error el usuario puede reintentar',
    );
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

    expect(
      fake.cobroUuids.length,
      1,
      reason: 'el mismo clic no debe generar dos cobros',
    );
  });

  testWidgets(
    'edición de ítems: total estimado local y total real del backend',
    (tester) async {
      final fake = _PedidosFake([
        _pedido('ped_1', total: 100, items: [_item('p1', precio: 100)]),
      ]);
      await _montar(tester, fake);
      await _abrirDetalle(tester, 'ped_1');
      expect(
        tester
            .widget<MontoOculto>(find.byKey(const Key('caja_detalle_total')))
            .monto,
        100.0,
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

      await _esperar(tester, find.text('\$300,00'));
      expect(
        tester
            .widget<MontoOculto>(find.byKey(const Key('caja_detalle_total')))
            .monto,
        300.0,
        reason: 'el total definitivo lo recalcula el backend',
      );
      await _drenarSnackBar(tester);
    },
  );

  testWidgets(
    'teléfono: la ficha ocupa toda la pantalla y el cobro se puede tocar',
    (tester) async {
      // Un pedido de verdulería real trae muchos ítems: con la barra de acciones
      // dentro del ListView, "Cobrar" empujaba su botón bajo el borde inferior.
      final fake = _PedidosFake([
        _pedido(
          'ped_1',
          total: 1500 * 12,
          items: [for (var i = 0; i < 12; i++) _item('p$i', precio: 1500)],
        ),
      ]);
      await _montar(tester, fake);

      // El tamaño real de la ventana: sólo así el MediaQuery del pane le sigue.
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pump();
      expect(
        tester.getSize(find.byKey(const Key('caja_lista'))).width,
        360,
        reason: 'la prueba simula un teléfono de 360dp',
      );

      expect(
        find.byKey(const Key('caja_detalle_volver')),
        findsNothing,
        reason: 'sin selección sólo se ve la lista',
      );

      await _abrirDetalle(tester, 'ped_1');

      expect(
        find.byKey(const Key('caja_lista')),
        findsNothing,
        reason: 'en ancho chico la lista cede la pantalla a la ficha',
      );
      final cobrar = find.byKey(const Key('caja_cobrar'));
      expect(cobrar, findsOneWidget);
      final rect = tester.getRect(cobrar);
      expect(rect.left, greaterThanOrEqualTo(0));
      expect(rect.right, lessThanOrEqualTo(360));
      expect(
        rect.bottom,
        lessThanOrEqualTo(780),
        reason: 'el botón de cobro queda dentro de la pantalla del teléfono',
      );
      expect(
        tester.getRect(find.byKey(const Key('caja_detalle_total'))).bottom,
        lessThanOrEqualTo(780),
        reason: 'el total se lee sin scrollear la ficha',
      );
      expect(
        tester.takeException(),
        isNull,
        reason: 'el layout angosto no desborda',
      );

      await tester.tap(cobrar);
      await _esperar(tester, find.byKey(const Key('cobro_dialogo')));
      await tester.tap(find.byKey(const Key('cobro_cancelar')));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const Key('cobro_dialogo')), findsNothing);

      await tester.tap(find.byKey(const Key('caja_detalle_volver')));
      await _esperar(tester, find.byKey(const Key('caja_lista')));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'teclado a pantalla: la ficha achicada no desborda y deja llegar al cobro',
    (tester) async {
      final fake = _PedidosFake([
        _pedido(
          'ped_1',
          total: 1500 * 12,
          items: [for (var i = 0; i < 12; i++) _item('p$i', precio: 1500)],
        ),
      ]);
      await _montar(tester, fake);

      // Con el teclado del teléfono abierto la app se queda en dos palmos: la
      // barra de filtros le cede el lugar a la ficha y el pie de cobro sigue fijo.
      tester.view.physicalSize = const Size(360, 260);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pump();

      await _abrirDetalle(tester, 'ped_1');
      expect(
        tester.takeException(),
        isNull,
        reason: 'la ficha entra en la ventana achicada sin desbordar',
      );
      expect(
        find.byKey(const Key('caja_filtro')),
        findsNothing,
        reason: 'con la ficha abierta el filtro no le roba altura al cobro',
      );
      expect(
        find.byKey(const Key('caja_detalle_ajustada')),
        findsNothing,
        reason: 'la ficha alcanza su pie fijo y no necesita el scroll de emergencia',
      );

      final cobrar = find.byKey(const Key('caja_cobrar'));
      expect(
        tester.getRect(cobrar).bottom,
        lessThanOrEqualTo(260),
        reason: 'el botón de cobro se toca sin deslizar la ficha',
      );
      expect(
        tester.getRect(find.byKey(const Key('caja_detalle_volver'))).bottom,
        lessThanOrEqualTo(260),
        reason: 'el regreso a la lista vive en la misma barra del total',
      );

      // Teclado abierto sobre el diálogo de cobro: la página de atrás se achica
      // todavía más y pasa a un único scroll en vez de desbordar.
      tester.view.physicalSize = const Size(360, 110);
      await tester.pump();
      expect(
        find.byKey(const Key('caja_vista_baja')),
        findsOneWidget,
        reason: 'bajo el piso de la vista todo entra en un solo scroll',
      );
      expect(cobrar, findsOneWidget);
      expect(
        tester.takeException(),
        isNull,
        reason: 'ni siquiera 110dp de app provocan un desborde',
      );
    },
  );

  testWidgets(
    'cobro con teclado: el diálogo desliza y confirmar queda a la vista',
    (tester) async {
      final fake = _PedidosFake([
        _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
      ]);
      await _montar(tester, fake);
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pump();

      await _abrirDetalle(tester, 'ped_1');
      await tester.tap(find.byKey(const Key('caja_cobrar')));
      await _esperar(tester, find.byKey(const Key('cobro_dialogo')));

      // El teclado deja ~300dp: sin el scroll propio del diálogo, el importe
      // recibido y el botón de confirmar quedaban fuera de la pantalla.
      tester.view.physicalSize = const Size(360, 300);
      await tester.pump();
      expect(find.byKey(const Key('cobro_scroll')), findsOneWidget);

      final campo = find.byKey(const Key('cobro_recibido'));
      await tester.ensureVisible(campo);
      final rectCampo = tester.getRect(campo);
      expect(rectCampo.top, greaterThanOrEqualTo(0));
      expect(rectCampo.bottom, lessThanOrEqualTo(300));

      final confirmar = find.byKey(const Key('cobro_confirmar'));
      expect(
        tester.getRect(confirmar).bottom,
        lessThanOrEqualTo(300),
        reason: 'se puede confirmar el cobro sin cerrar el teclado',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('el sondeo relee sin esconder la lista ni la ficha', (
    tester,
  ) async {
    final fake = _PedidosFake([
      _pedido('ped_1', total: 1500, items: [_item('p1', precio: 1500)]),
    ])..retraso = const Duration(milliseconds: 120);
    await _montar(tester, fake, intervalo: const Duration(seconds: 30));
    await _abrirDetalle(tester, 'ped_1');
    expect(
      fake.estadosConsultados.length,
      1,
      reason: 'la primera carga la hace el provider',
    );

    await tester.pump(const Duration(seconds: 30));

    expect(
      find.byKey(const Key('caja_cargando')),
      findsNothing,
      reason: 'releer conserva lo que ya estaba en pantalla',
    );
    expect(find.byKey(const Key('caja_tile_ped_1')), findsOneWidget);
    expect(find.byKey(const Key('caja_detalle')), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 400));

    expect(
      fake.estadosConsultados.length,
      2,
      reason: 'el tick volvió a leer, una sola vez',
    );
    expect(find.byKey(const Key('caja_detalle')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
