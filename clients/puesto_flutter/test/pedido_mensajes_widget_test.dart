import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/pedidos/pedido_detalle_screen.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/mensajes.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/mensajes_service.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class _PedidosFake implements PedidosService {
  _PedidosFake(this.pedido);

  Pedido pedido;

  @override
  Future<Pedido> detalle(String id) async => pedido;

  @override
  Future<void> entregar(String id) async => throw UnimplementedError();

  @override
  Future<Pedido> actualizarEstado(String id, PedidoEstado estado) async =>
      throw UnimplementedError();

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async =>
      [pedido];

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

class _MensajesFake implements MensajesService {
  _MensajesFake(this._mensajes);

  List<Mensaje> _mensajes;
  int enviarLlamadas = 0;
  ApiException? enviarError;

  @override
  Future<MensajesPagina> mensajesDelPedido(String pedidoId) async =>
      MensajesPagina(mensajes: _mensajes, hayMas: false);

  @override
  Future<void> enviar(String pedidoId, String cuerpo) async {
    enviarLlamadas++;
    final error = enviarError;
    if (error != null) throw error;
    _mensajes = [
      ..._mensajes,
      Mensaje(
        id: 'm_new_$enviarLlamadas',
        emisor: 'negocio',
        cuerpo: cuerpo,
        createdAt: '2026-10-16 12:00:00+00',
      ),
    ];
  }

  @override
  Future<List<ConversacionResumen>> listarConversaciones() async =>
      throw UnimplementedError();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Pedido _pedido(String id, {required PedidoEstado estado}) => Pedido(
      id: id,
      clientUuid: 'uuid-$id',
      vendedorId: null,
      vendedorNombre: null,
      clienteId: null,
      clienteNombre: 'Ana',
      estado: estado,
      nota: null,
      items: const [],
      total: 100,
      createdAt: '2026-10-16 10:00:00+00',
      updatedAt: '2026-10-16 10:00:00+00',
      formaPago: null,
      comprobanteNombre: null,
    );

Future<void> _esperar(
  WidgetTester tester,
  Finder finder, {
  int intentos = 50,
}) async {
  for (var i = 0; i < intentos; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('No aparecio en pantalla: $finder');
}

Future<void> _montar(
  WidgetTester tester, {
  required _PedidosFake pedidosFake,
  required _MensajesFake mensajesFake,
}) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      pedidosServiceProvider.overrideWithValue(pedidosFake),
      mensajesServiceProvider.overrideWithValue(mensajesFake),
    ],
    child: const MaterialApp(
      home: PedidoDetalleScreen(pedidoId: 'ped_1'),
    ),
  ));
  // Esperar a que el detalle cargue y las animaciones terminen.
  await _esperar(tester, find.byKey(const Key('pedido_detalle_tabs')));
  await tester.pumpAndSettle();
}

/// Cambia a la pestana Mensajes y espera a que el contenido sea visible.
Future<void> _irAPestanaMensajes(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('pedido_tab_mensajes')));
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('las dos pestanas estan presentes', (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    expect(find.byKey(const Key('pedido_tab_detalle')), findsOneWidget);
    expect(find.byKey(const Key('pedido_tab_mensajes')), findsOneWidget);
  });

  testWidgets('pestana Detalle muestra el contenido del pedido', (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    // La pestana Detalle esta activa por defecto.
    expect(find.text('Cliente: Ana'), findsOneWidget);
    expect(find.text('Enviado'), findsOneWidget);
  });

  testWidgets('pestana Mensajes: lista vacia muestra placeholder',
      (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    await _irAPestanaMensajes(tester);

    expect(
      find.text('Todavia no hay mensajes en este pedido.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('pedido_mensajes_campo')), findsOneWidget);
    expect(find.byKey(const Key('pedido_mensajes_enviar')), findsOneWidget);
  });

  testWidgets('pestana Mensajes: muestra los mensajes del hilo',
      (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake([
      const Mensaje(
        id: 'm1',
        emisor: 'cliente',
        cuerpo: 'Hola, tengo una consulta',
        createdAt: '2026-10-16 11:00:00+00',
      ),
      const Mensaje(
        id: 'm2',
        emisor: 'negocio',
        cuerpo: 'Decime',
        createdAt: '2026-10-16 11:01:00+00',
      ),
    ]);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    await _irAPestanaMensajes(tester);
    await _esperar(tester, find.text('Hola, tengo una consulta'));

    expect(find.text('Hola, tengo una consulta'), findsOneWidget);
    expect(find.text('Decime'), findsOneWidget);
    expect(find.text('Cliente'), findsOneWidget);
    expect(find.text('Negocio'), findsOneWidget);
  });

  testWidgets('enviar mensaje: llama al servicio y limpia el campo',
      (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    await _irAPestanaMensajes(tester);
    await _esperar(tester, find.byKey(const Key('pedido_mensajes_campo')));

    await tester.enterText(
      find.byKey(const Key('pedido_mensajes_campo')),
      'Listo para retirar',
    );
    await tester.tap(find.byKey(const Key('pedido_mensajes_enviar')));
    await tester.pumpAndSettle();

    expect(mensajesFake.enviarLlamadas, 1);
    // El campo queda vacio tras enviar.
    final campo = tester
        .widget<TextField>(find.byKey(const Key('pedido_mensajes_campo')));
    expect(campo.controller!.text, isEmpty);
  });

  testWidgets('error al enviar: muestra el mensaje de error', (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    mensajesFake.enviarError =
        ServerException('Falla simulada del servidor.');
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    await _irAPestanaMensajes(tester);
    await _esperar(tester, find.byKey(const Key('pedido_mensajes_campo')));

    await tester.enterText(
      find.byKey(const Key('pedido_mensajes_campo')),
      'Hola',
    );
    await tester.tap(find.byKey(const Key('pedido_mensajes_enviar')));
    await _esperar(tester, find.byKey(const Key('pedido_mensajes_error')));

    expect(find.text('Falla simulada del servidor.'), findsOneWidget);
    expect(mensajesFake.enviarLlamadas, 1);
  });

  testWidgets('no permite enviar texto vacio', (tester) async {
    final pedidosFake =
        _PedidosFake(_pedido('ped_1', estado: PedidoEstado.enviado));
    final mensajesFake = _MensajesFake(const []);
    await _montar(tester,
        pedidosFake: pedidosFake, mensajesFake: mensajesFake);

    await _irAPestanaMensajes(tester);
    await _esperar(tester, find.byKey(const Key('pedido_mensajes_campo')));

    // Enviar sin texto: no debe invocar al servicio.
    await tester.tap(find.byKey(const Key('pedido_mensajes_enviar')));
    await tester.pump(const Duration(milliseconds: 200));

    expect(mensajesFake.enviarLlamadas, 0);
  });
}
