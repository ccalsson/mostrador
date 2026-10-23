import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/core/errors/api_exceptions.dart';
import 'package:puesto_flutter/features/carrito/carrito_controller.dart';
import 'package:puesto_flutter/models/carrito.dart';
import 'package:puesto_flutter/models/cobro.dart';
import 'package:puesto_flutter/models/pedido.dart';
import 'package:puesto_flutter/models/pedido_pendiente.dart';
import 'package:puesto_flutter/models/producto.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/conectividad_service.dart';
import 'package:puesto_flutter/services/offline_queue_service.dart';
import 'package:puesto_flutter/services/pedidos_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fake de PedidosService que permite simular éxitos y fallos.
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
  Future<List<Pedido>> listar({bool mine = false, String? estados}) async =>
      const [];

  @override
  Future<void> entregar(String id) async {}

  @override
  Future<Pedido> actualizarEstado(String id, PedidoEstado estado) async =>
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

/// Fake de ConectividadService que siempre reporta conexión.
class _ConectividadFake implements ConectividadService {
  bool conectado = true;

  @override
  Future<bool> hayConexion() async => conectado;

  @override
  void iniciar() {}

  @override
  void dispose() {}

  @override
  void addListener(void Function(bool) listener) {}

  @override
  void removeListener(void Function(bool) listener) {}
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
  late _ConectividadFake conectividad;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    pedidos = _PedidosFake();
    conectividad = _ConectividadFake();
    container = ProviderContainer(
      overrides: [
        pedidosServiceProvider.overrideWithValue(pedidos),
        conectividadServiceProvider.overrideWithValue(conectividad),
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
  });

  tearDown(() => container.dispose());

  CarritoController controlador() =>
      container.read(carritoControllerProvider.notifier);
  Carrito carrito() => container.read(carritoControllerProvider);
  OfflineQueueService queueService() =>
      container.read(offlineQueueServiceProvider);

  group('Replay con éxito', () {
    test('replay exitoso envía el pedido y lo elimina de la cola', () async {
      // Agregar un pedido pendiente manualmente a la cola.
      final pendiente = PedidoPendiente(
        clientUuid: 'uuid-replay-1',
        items: const [PedidoPendienteItem(productoId: 'p1', cantidad: 2)],
        timestamp: DateTime.now(),
      );
      await queueService().agregar(pendiente);
      expect(queueService().leer().length, 1);

      // Ejecutar replay.
      final resultados = await controlador().replayPendientes();

      // Verificar que se envió correctamente.
      expect(resultados.length, 1);
      expect(resultados.first.exito, isTrue);
      expect(resultados.first.clientUuid, 'uuid-replay-1');
      expect(pedidos.uuids, contains('uuid-replay-1'));

      // Verificar que se eliminó de la cola.
      expect(queueService().leer(), isEmpty);
    });

    test('replay exitoso con múltiples pedidos', () async {
      await queueService().agregar(PedidoPendiente(
        clientUuid: 'uuid-1',
        items: const [PedidoPendienteItem(productoId: 'p1', cantidad: 1)],
        timestamp: DateTime.now(),
      ));
      await queueService().agregar(PedidoPendiente(
        clientUuid: 'uuid-2',
        items: const [PedidoPendienteItem(productoId: 'p2', cantidad: 3)],
        timestamp: DateTime.now(),
      ));

      final resultados = await controlador().replayPendientes();

      expect(resultados.length, 2);
      expect(resultados.every((r) => r.exito), isTrue);
      expect(queueService().leer(), isEmpty);
      expect(pedidos.uuids.length, 2);
    });
  });

  group('Replay con fallo', () {
    test('replay fallido incrementa reintentos', () async {
      pedidos.error = NetworkException('sin red');
      final pendiente = PedidoPendiente(
        clientUuid: 'uuid-fallo',
        items: const [PedidoPendienteItem(productoId: 'p1', cantidad: 1)],
        timestamp: DateTime.now(),
        reintentos: 0,
      );
      await queueService().agregar(pendiente);

      final resultados = await controlador().replayPendientes();

      expect(resultados.length, 1);
      expect(resultados.first.exito, isFalse);
      expect(resultados.first.agotado, isFalse);

      // Verificar que se incrementaron los reintentos.
      final cola = queueService().leer();
      expect(cola.length, 1);
      expect(cola.first.reintentos, 1);
    });

    test('replay tras 3 reintentos descarta el pedido y marca agotado', () async {
      pedidos.error = NetworkException('sin red');
      final pendiente = PedidoPendiente(
        clientUuid: 'uuid-agotado',
        items: const [PedidoPendienteItem(productoId: 'p1', cantidad: 1)],
        timestamp: DateTime.now(),
        reintentos: 2, // Ya tiene 2 reintentos, este será el 3ro.
      );
      await queueService().agregar(pendiente);

      final resultados = await controlador().replayPendientes();

      expect(resultados.length, 1);
      expect(resultados.first.exito, isFalse);
      expect(resultados.first.agotado, isTrue);

      // Verificar que se eliminó de la cola.
      expect(queueService().leer(), isEmpty);
    });

    test('pedido ya agotado se descarta sin intentar enviar', () async {
      final pendiente = PedidoPendiente(
        clientUuid: 'uuid-ya-agotado',
        items: const [PedidoPendienteItem(productoId: 'p1', cantidad: 1)],
        timestamp: DateTime.now(),
        reintentos: 3, // Ya agotado.
      );
      await queueService().agregar(pendiente);

      final resultados = await controlador().replayPendientes();

      expect(resultados.length, 1);
      expect(resultados.first.exito, isFalse);
      expect(resultados.first.agotado, isTrue);
      // No se intentó enviar (el fake no recibió nada).
      expect(pedidos.uuids, isEmpty);
      expect(queueService().leer(), isEmpty);
    });
  });

  group('Confirmar sin conexión guarda offline', () {
    test('confirmar sin conexión guarda en la cola y cambia estado', () async {
      conectividad.conectado = false;
      controlador().agregar(_producto('p1', precio: 200));

      await controlador().confirmar();

      // Verificar estado del carrito.
      expect(carrito().envio, EnvioEstado.guardadoOffline);
      expect(carrito().clientUuid, isNotNull);

      // Verificar que se guardó en la cola.
      final cola = queueService().leer();
      expect(cola.length, 1);
      expect(cola.first.items.first.productoId, 'p1');
      expect(cola.first.items.first.cantidad, 1);
    });

    test('confirmar con NetworkException guarda offline', () async {
      pedidos.error = NetworkException('sin red');
      controlador().agregar(_producto('p1'));

      await controlador().confirmar();

      expect(carrito().envio, EnvioEstado.guardadoOffline);
      expect(queueService().leer().length, 1);
    });

    test('confirmar con error no-NetworkException muestra error, no offline',
        () async {
      pedidos.error = ServerException('Error del servidor');
      controlador().agregar(_producto('p1'));

      await controlador().confirmar();

      expect(carrito().envio, EnvioEstado.error);
      expect(queueService().leer(), isEmpty);
    });
  });
}
