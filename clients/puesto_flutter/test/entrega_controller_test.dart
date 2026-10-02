import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/pedidos/entrega_controller.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _PedidosFake implements PedidosService {
  _PedidosFake(this.pedidos);

  List<Pedido> pedidos;
  ApiException? listarError;
  ApiException? entregarError;
  int detalleLlamadas = 0;
  final List<String> entregados = [];

  @override
  Future<void> entregar(String id) async {
    entregados.add(id);
    final fallo = entregarError;
    if (fallo != null) throw fallo;
    pedidos = [
      for (final p in pedidos)
        p.id == id ? _pedido(id, estado: PedidoEstado.entregado) : p,
    ];
  }

  @override
  Future<Pedido> detalle(String id) async {
    detalleLlamadas++;
    return pedidos.firstWhere((p) => p.id == id);
  }

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async {
    final fallo = listarError;
    if (fallo != null) throw fallo;
    return pedidos;
  }

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

Pedido _pedido(String id, {PedidoEstado estado = PedidoEstado.cobrado}) => Pedido(
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

  test('listado: devuelve los pedidos del vendedor', () async {
    final lista = await container.read(pedidosMineProvider.future);
    expect(lista.single.id, 'ped_1');
  });

  test('listado vacío: devuelve una lista sin elementos', () async {
    pedidos.pedidos = [];
    final lista = await container.read(pedidosMineProvider.future);
    expect(lista, isEmpty);
  });

  test('listado con error: propaga la excepción al consumidor', () async {
    pedidos.listarError = NetworkException();
    await expectLater(
      container.read(pedidosMineProvider.future),
      throwsA(isA<NetworkException>()),
    );
  });

  test('detalle: obtiene el pedido solicitado', () async {
    final pedido = await container.read(pedidoDetalleProvider('ped_1').future);
    expect(pedido.id, 'ped_1');
    expect(pedidos.detalleLlamadas, 1);
  });

  test('entrega exitosa: relee el detalle del backend y refleja el estado',
      () async {
    final sub = container.listen(pedidoDetalleProvider('ped_1'), (_, _) {});
    addTearDown(sub.close);
    await container.read(pedidoDetalleProvider('ped_1').future);
    expect(pedidos.detalleLlamadas, 1);

    await container.read(entregaControllerProvider('ped_1').notifier).entregar();

    expect(pedidos.entregados, ['ped_1']);
    final refrescado =
        await container.read(pedidoDetalleProvider('ped_1').future);
    expect(refrescado.estado, PedidoEstado.entregado);
    expect(pedidos.detalleLlamadas, 2,
        reason: 'el detalle debe releerse del backend, no mutarse en el cliente');
  });

  test('error de entrega: deja la fase en error y el pedido intacto', () async {
    pedidos.entregarError =
        ValidationException('Solo se entrega un pedido ya cobrado.');
    final controller = container.read(entregaControllerProvider('ped_1').notifier);

    await controller.entregar();

    expect(controller.state.fase, EntregaFase.error);
    expect(controller.state.errorMensaje, contains('cobrado'));
    final pedido = await container.read(pedidoDetalleProvider('ped_1').future);
    expect(pedido.estado, PedidoEstado.cobrado);
    expect(pedidos.detalleLlamadas, 1,
        reason: 'un error de entrega no dispara relectura del detalle');
  });

  test('doble submit: llamadas concurrentes envían una sola petición', () async {
    final controller = container.read(entregaControllerProvider('ped_1').notifier);
    final primera = controller.entregar();
    final segunda = controller.entregar();
    await Future.wait([primera, segunda]);
    expect(pedidos.entregados, ['ped_1']);
  });

  test('reentrega tras éxito: no vuelve a llamar al backend', () async {
    final controller = container.read(entregaControllerProvider('ped_1').notifier);
    await controller.entregar();
    await controller.entregar();
    expect(pedidos.entregados.length, 1);
    expect(controller.state.fase, EntregaFase.exito);
  });

  test('el estado de entrega es por pedido', () async {
    pedidos.pedidos = [_pedido('ped_1'), _pedido('ped_2')];
    await container.read(entregaControllerProvider('ped_1').notifier).entregar();
    final otro = container.read(entregaControllerProvider('ped_2'));
    expect(otro.fase, EntregaFase.inactiva);
    expect(pedidos.entregados, ['ped_1']);
  });
}
