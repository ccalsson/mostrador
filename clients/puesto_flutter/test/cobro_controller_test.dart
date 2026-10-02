import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/format.dart';
import 'package:puesto_flutter/features/caja/cobro_controller.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _PedidosFake implements PedidosService {
  _PedidosFake(this.pedidos);

  List<Pedido> pedidos;
  ApiException? cobrarError;
  int detalleLlamadas = 0;
  final List<String> clientUuids = [];
  final List<FormaPago> formas = [];
  final List<double?> recibidos = [];

  @override
  Future<CobroResultado> cobrar(
    String id, {
    required String clientUuid,
    required FormaPago formaPago,
    double? montoRecibido,
  }) async {
    clientUuids.add(clientUuid);
    formas.add(formaPago);
    recibidos.add(montoRecibido);
    final fallo = cobrarError;
    if (fallo != null) throw fallo;
    pedidos = [
      for (final p in pedidos)
        p.id == id ? _pedido(id, estado: PedidoEstado.cobrado) : p,
    ];
    // El vuelto distintivo permite verificar que la UI usa la respuesta del
    // backend y no el cálculo local (recibido - total).
    return const CobroResultado(
      cobroId: 'cob_1',
      ticketId: 'tck_1',
      numero: 7,
      vuelto: 123.45,
      total: 876.55,
    );
  }

  @override
  Future<Pedido> detalle(String id) async {
    detalleLlamadas++;
    return pedidos.firstWhere((p) => p.id == id);
  }

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async => pedidos;

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
  Future<Pedido> actualizarItems(
    String id,
    List<({String productoId, double cantidad})> items,
  ) async =>
      throw UnimplementedError();

  @override
  Future<Ticket> ticket(String cobroId) async => throw UnimplementedError();
}

Pedido _pedido(String id, {PedidoEstado estado = PedidoEstado.enviado}) => Pedido(
      id: id,
      clientUuid: 'uuid-$id',
      vendedorId: 'stf_venta',
      vendedorNombre: 'Venta',
      clienteId: null,
      clienteNombre: 'Mostrador',
      estado: estado,
      nota: null,
      items: const [],
      total: 1500,
      createdAt: '',
      updatedAt: '',
      formaPago: null,
      comprobanteNombre: null,
    );

void main() {
  late _PedidosFake pedidos;
  late ProviderContainer container;

  setUp(() {
    pedidos = _PedidosFake([_pedido('ped_1')]);
    container = ProviderContainer(
      overrides: [pedidosServiceProvider.overrideWithValue(pedidos)],
    );
  });

  tearDown(() => container.dispose());

  test('cobro exitoso: expone el resultado del backend y relee el detalle',
      () async {
    final sub = container.listen(pedidoDetalleProvider('ped_1'), (_, _) {});
    addTearDown(sub.close);
    await container.read(pedidoDetalleProvider('ped_1').future);
    expect(pedidos.detalleLlamadas, 1);

    final controller = container.read(cobroControllerProvider('ped_1').notifier);
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 1000);

    expect(controller.state.fase, CobroFase.exito);
    expect(controller.state.resultado?.cobroId, 'cob_1');
    expect(controller.state.resultado?.ticketId, 'tck_1');
    final refrescado = await container.read(pedidoDetalleProvider('ped_1').future);
    expect(refrescado.estado, PedidoEstado.cobrado);
    expect(pedidos.detalleLlamadas, 2,
        reason: 'el detalle se relee del backend, sin transición local');
  });

  test('efectivo envía el importe recibido; tarjeta no lo envía', () async {
    final controller = container.read(cobroControllerProvider('ped_1').notifier);
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    expect(pedidos.formas.single, FormaPago.efectivo);
    expect(pedidos.recibidos.single, 2000);

    await controller.cobrar(formaPago: FormaPago.tarjeta);
    expect(pedidos.formas.length, 1,
        reason: 'tras el éxito no se repite la petición');
  });

  test('el vuelto mostrado sale del backend, no del cálculo local', () async {
    final controller = container.read(cobroControllerProvider('ped_1').notifier);
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 1000);
    // Local sería 1000 - 1500 = -500; el backend devuelve 123.45.
    expect(controller.state.resultado?.vuelto, 123.45);
  });

  test('doble submit: llamadas concurrentes envían una sola petición', () async {
    final controller = container.read(cobroControllerProvider('ped_1').notifier);
    final primera = controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    final segunda = controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    await Future.wait([primera, segunda]);
    expect(pedidos.clientUuids.length, 1);
    expect(pedidos.clientUuids.single, isNotEmpty);
  });

  test('error de cobro: fase error, pedido intacto y reintento con el mismo uuid',
      () async {
    pedidos.cobrarError =
        ValidationException('El monto recibido no cubre el total.');
    final controller = container.read(cobroControllerProvider('ped_1').notifier);

    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 10);

    expect(controller.state.fase, CobroFase.error);
    expect(controller.state.errorMensaje, contains('no cubre'));
    final pedido = await container.read(pedidoDetalleProvider('ped_1').future);
    expect(pedido.estado, PedidoEstado.enviado);
    expect(pedidos.detalleLlamadas, 1,
        reason: 'un error de cobro no dispara relectura del detalle');

    pedidos.cobrarError = null;
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    expect(pedidos.clientUuids.length, 2);
    expect(pedidos.clientUuids[1], pedidos.clientUuids[0],
        reason: 'el reintento del mismo intento lógico reutiliza el clientUuid');
    expect(controller.state.fase, CobroFase.exito);
  });

  test('reintento tras éxito: no vuelve a llamar al backend', () async {
    final controller = container.read(cobroControllerProvider('ped_1').notifier);
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    await controller.cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    expect(pedidos.clientUuids.length, 1);
    expect(controller.state.fase, CobroFase.exito);
  });

  test('el estado de cobro es por pedido', () async {
    pedidos.pedidos = [_pedido('ped_1'), _pedido('ped_2')];
    await container
        .read(cobroControllerProvider('ped_1').notifier)
        .cobrar(formaPago: FormaPago.efectivo, montoRecibido: 2000);
    final otro = container.read(cobroControllerProvider('ped_2'));
    expect(otro.fase, CobroFase.inactiva);
    expect(pedidos.clientUuids.length, 1);
  });

  test('parseDecimal acepta coma o punto y rechaza agrupadores de miles', () {
    expect(parseDecimal('1500'), 1500);
    expect(parseDecimal('1500,50'), 1500.5);
    expect(parseDecimal('1500.50'), 1500.5);
    expect(parseDecimal('1.500'), isNull);
    expect(parseDecimal(''), isNull);
    expect(parseDecimal('-10'), isNull);
    expect(redondear2(0.1 + 0.2), 0.3);
  });
}
