import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mercado_al_toque/refresco.dart';
import 'package:mercado_al_toque/screens/buyer_orders_screen.dart';
import 'package:mercado_al_toque/screens/courier_screen.dart';
import 'package:mercado_al_toque/screens/order_detail_screen.dart';

import 'refresco_fixtures.dart';

void main() {
  testWidgets('Puestos y avisos se sondean solos cada 45 segundos', (
    tester,
  ) async {
    final api = ApiFake(puestos: [puestoFijo], avisos: [avisoPrecio]);
    await tester.pumpWidget(puestosScreen(api, refrescoPuestos));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('aviso_bnr_1')), findsOneWidget);
    expect(api.puestosLlamadas, 1);
    expect(api.avisosLlamadas, 1);

    await tester.pump(const Duration(seconds: 44));
    expect(api.puestosLlamadas, 1);
    expect(api.avisosLlamadas, 1);

    await tester.pump(const Duration(seconds: 1));
    expect(api.puestosLlamadas, 2);
    expect(api.avisosLlamadas, 2);
  });

  testWidgets('El catálogo del puesto se sondea sin salir del detalle', (
    tester,
  ) async {
    final api = ApiFake(puestos: [puestoFijo], catalogo: [banana]);
    await tester.pumpWidget(puestosScreen(api, refrescoPuestos));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Frutas Roman'));
    await tester.pumpAndSettle();

    expect(api.catalogoLlamadas, 1);
    final puestosAntes = api.puestosLlamadas;

    await tester.pump(const Duration(seconds: 45));
    expect(api.catalogoLlamadas, 2);
    expect(api.puestosLlamadas, puestosAntes);
  });

  testWidgets('Mis pedidos se sondean cada 20 segundos', (tester) async {
    final api = ApiFake(pedidos: [pedidoComprador(estado: 'preparado')]);
    await tester.pumpWidget(
      anclado(BuyerOrdersScreen(api: api, actor: compradorActor())),
    );
    await tester.pumpAndSettle();

    expect(api.pedidosLlamadas, 1);
    expect(api.recorridosLlamadas, 1);

    await tester.pump(const Duration(seconds: 19));
    expect(api.pedidosLlamadas, 1);

    await tester.pump(const Duration(seconds: 1));
    expect(api.pedidosLlamadas, 2);
    expect(api.recorridosLlamadas, 2);
  });

  testWidgets('El cargador ve un recorrido nuevo sin reabrir la app', (
    tester,
  ) async {
    final api = ApiFake();
    await tester.pumpWidget(
      anclado(CourierScreen(api: api, actor: cargadorActor())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Todavía no tenés recorridos.'), findsOneWidget);

    api.recorridos = [recorrido()];
    await tester.pump(const Duration(seconds: 15));
    await tester.pumpAndSettle();

    expect(find.text('Aceptar'), findsOneWidget);
    expect(api.recorridosLlamadas, 2);
  });

  testWidgets('El detalle se sondea cada 10 segundos y para en estado final', (
    tester,
  ) async {
    final api = ApiFake(pedido: pedidoComprador());
    await tester.pumpWidget(
      anclado(OrderDetailScreen(api: api, pedidoId: 'ped_1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Confirmado'), findsOneWidget);
    expect(api.pedidoLlamadas, 1);

    api.pedido = pedidoComprador(estado: 'entregado');
    await tester.pump(const Duration(seconds: 10));
    await tester.pumpAndSettle();

    expect(find.text('Entregado'), findsOneWidget);
    expect(api.pedidoLlamadas, 2);

    await tester.pump(const Duration(minutes: 1));
    expect(api.pedidoLlamadas, 2);
  });

  testWidgets('Un sondeo sin conexión muestra el error y reintenta solo', (
    tester,
  ) async {
    final api = ApiSinRed();
    await tester.pumpWidget(
      anclado(CourierScreen(api: api, actor: cargadorActor())),
    );
    await tester.pumpAndSettle();

    expect(find.text('No hay conexión con el servidor.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 15));
    await tester.pumpAndSettle();

    expect(api.recorridosLlamadas, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('refrescoCada en cero deja la pantalla sin ningún timer', (
    tester,
  ) async {
    final api = ApiFake(puestos: [puestoFijo], avisos: [avisoPrecio]);
    await tester.pumpWidget(puestosScreen(api, Duration.zero));
    await tester.pumpAndSettle();

    await tester.pump(const Duration(minutes: 10));
    expect(api.puestosLlamadas, 1);
    expect(api.avisosLlamadas, 1);
  });
}
