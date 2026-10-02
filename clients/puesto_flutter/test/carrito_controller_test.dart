import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/core/ids.dart';
import 'package:puesto_flutter/features/carrito/carrito_controller.dart';
import 'package:puesto_flutter/models/carrito.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';

class _PedidosFake implements PedidosService {
  final List<String> uuids = [];
  final List<List<({String productoId, int cantidad})>> enviados = [];
  ApiException? error;
  int secuencia = 0;

  @override
  Future<Pedido> crear({
    required String clientUuid,
    required List<({String productoId, int cantidad})> items,
    String clienteNombre = 'Mostrador',
    String? nota,
  }) async {
    uuids.add(clientUuid);
    enviados.add(items);
    final fallo = error;
    if (fallo != null) throw fallo;
    secuencia++;
    return _pedido(id: 'ped_$secuencia', clientUuid: clientUuid);
  }

  @override
  Future<Pedido> detalle(String id) async => _pedido(id: id, clientUuid: id);

  @override
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async => const [];

  @override
  Future<void> entregar(String id) async {}

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

Pedido _pedido({required String id, required String clientUuid}) => Pedido(
      id: id,
      clientUuid: clientUuid,
      vendedorId: 'stf_venta',
      vendedorNombre: 'Venta',
      clienteId: null,
      clienteNombre: 'Mostrador',
      estado: PedidoEstado.enviado,
      nota: null,
      items: const [],
      total: 0,
      createdAt: '',
      updatedAt: '',
      formaPago: null,
      comprobanteNombre: null,
    );

Producto _producto(String id, {double precio = 100, String nombre = 'Producto'}) =>
    Producto(
      id: id,
      nombre: nombre,
      unidad: 'kg',
      unidadLabel: 'kg',
      precio: precio,
      stock: 10,
      stockMinimo: 1,
      alias: const [],
      activo: true,
      stockBajo: false,
    );

void main() {
  late _PedidosFake pedidos;
  late ProviderContainer container;

  setUp(() {
    pedidos = _PedidosFake();
    container = ProviderContainer(
      overrides: [pedidosServiceProvider.overrideWithValue(pedidos)],
    );
  });

  tearDown(() => container.dispose());

  CarritoController controlador() =>
      container.read(carritoControllerProvider.notifier);
  Carrito carrito() => container.read(carritoControllerProvider);

  test('arranca vacío, sin total y sin clientUuid', () {
    expect(carrito().vacio, isTrue);
    expect(carrito().unidades, 0);
    expect(carrito().total, 0);
    expect(carrito().clientUuid, isNull);
  });

  test('agregar el mismo producto acumula cantidad y subtotal', () {
    controlador().agregar(_producto('p1', precio: 150));
    controlador().agregar(_producto('p1', precio: 150));
    expect(carrito().lineas.length, 1);
    expect(carrito().lineas.first.cantidad, 2);
    expect(carrito().total, 300);
  });

  test('agregar productos distintos crea líneas separadas y suma el total', () {
    controlador().agregar(_producto('p1', precio: 100));
    controlador().agregar(_producto('p2', precio: 250.5));
    expect(carrito().lineas.length, 2);
    expect(carrito().unidades, 2);
    expect(carrito().total, closeTo(350.5, 0.001));
  });

  test('fijarCantidad modifica la cantidad y el total', () {
    controlador().agregar(_producto('p1', precio: 100));
    controlador().fijarCantidad('p1', 5);
    expect(carrito().lineas.first.cantidad, 5);
    expect(carrito().total, 500);
  });

  test('fijarCantidad en cero o menos elimina la línea', () {
    controlador().agregar(_producto('p1'));
    controlador().fijarCantidad('p1', 0);
    expect(carrito().vacio, isTrue);
    controlador().agregar(_producto('p1'));
    controlador().fijarCantidad('p1', -3);
    expect(carrito().vacio, isTrue);
  });

  test('quitar elimina solo el producto indicado', () {
    controlador().agregar(_producto('p1'));
    controlador().agregar(_producto('p2'));
    controlador().quitar('p1');
    expect(carrito().lineas.length, 1);
    expect(carrito().lineas.first.productoId, 'p2');
  });

  test('carrito vacío no dispara ninguna petición', () async {
    await controlador().confirmar();
    expect(pedidos.uuids, isEmpty);
  });

  test('confirmar exitoso expone el pedido y limpia el carrito', () async {
    controlador().agregar(_producto('p1', precio: 200));
    await controlador().confirmar();
    expect(carrito().envio, EnvioEstado.creado);
    expect(carrito().pedido?.id, 'ped_1');
    expect(carrito().vacio, isTrue);
    expect(carrito().clientUuid, isNull);
    expect(pedidos.enviados.single.single.productoId, 'p1');
  });

  test('un error deja el carrito intacto y conserva el clientUuid', () async {
    pedidos.error = NetworkException();
    controlador().agregar(_producto('p1'));
    await controlador().confirmar();
    expect(carrito().envio, EnvioEstado.error);
    expect(carrito().errorMensaje, isNotNull);
    expect(carrito().lineas.length, 1);
    expect(carrito().clientUuid, isNotNull);
  });

  test('el reintento reenvía exactamente el mismo clientUuid', () async {
    pedidos.error = NetworkException('sin red');
    controlador().agregar(_producto('p1'));
    await controlador().confirmar();
    final uuid = carrito().clientUuid;

    pedidos.error = null;
    await controlador().confirmar();
    expect(pedidos.uuids.length, 2);
    expect(pedidos.uuids[0], uuid);
    expect(pedidos.uuids[1], uuid);
    expect(carrito().envio, EnvioEstado.creado);
    expect(carrito().pedido?.clientUuid, uuid);
  });

  test('un intento nuevo tras el éxito genera otro clientUuid', () async {
    controlador().agregar(_producto('p1'));
    await controlador().confirmar();
    controlador().reiniciar();
    controlador().agregar(_producto('p2'));
    await controlador().confirmar();
    expect(pedidos.uuids.length, 2);
    expect(pedidos.uuids[1], isNot(pedidos.uuids[0]));
  });

  test('editar tras un error limpia el mensaje pero conserva el uuid', () async {
    pedidos.error = NetworkException();
    controlador().agregar(_producto('p1'));
    await controlador().confirmar();
    final uuid = carrito().clientUuid;
    controlador().agregar(_producto('p2'));
    expect(carrito().envio, EnvioEstado.inactivo);
    expect(carrito().errorMensaje, isNull);
    expect(carrito().clientUuid, uuid);
  });

  test('confirmar dos veces en paralelo sólo envía una petición', () async {
    controlador().agregar(_producto('p1'));
    final primera = controlador().confirmar();
    final segunda = controlador().confirmar();
    await Future.wait([primera, segunda]);
    expect(pedidos.uuids.length, 1);
  });

  test('generarUuidV4 produce un UUID v4 válido y único', () {
    final a = generarUuidV4();
    final b = generarUuidV4();
    final v4 = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );
    expect(v4.hasMatch(a), isTrue);
    expect(v4.hasMatch(b), isTrue);
    expect(a, isNot(b));
  });
}
