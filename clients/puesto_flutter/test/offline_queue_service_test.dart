import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/models/pedido_pendiente.dart';
import 'package:puesto_flutter/services/offline_queue_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedPreferences prefs;
  late OfflineQueueService service;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    service = OfflineQueueService(prefs);
  });

  group('OfflineQueueService - persistencia local', () {
    test('arranca vacía', () {
      expect(service.leer(), isEmpty);
    });

    test('agregar y leer un pedido pendiente', () async {
      final pedido = _pedidoPendiente('uuid-1', productos: ['p1', 'p2']);
      await service.agregar(pedido);

      final cola = service.leer();
      expect(cola.length, 1);
      expect(cola.first.clientUuid, 'uuid-1');
      expect(cola.first.items.length, 2);
      expect(cola.first.reintentos, 0);
    });

    test('agregar múltiples pedidos mantiene el orden', () async {
      await service.agregar(_pedidoPendiente('uuid-1'));
      await service.agregar(_pedidoPendiente('uuid-2'));
      await service.agregar(_pedidoPendiente('uuid-3'));

      final cola = service.leer();
      expect(cola.length, 3);
      expect(cola[0].clientUuid, 'uuid-1');
      expect(cola[1].clientUuid, 'uuid-2');
      expect(cola[2].clientUuid, 'uuid-3');
    });

    test('eliminar por clientUuid remueve solo ese pedido', () async {
      await service.agregar(_pedidoPendiente('uuid-1'));
      await service.agregar(_pedidoPendiente('uuid-2'));
      await service.agregar(_pedidoPendiente('uuid-3'));

      await service.eliminar('uuid-2');

      final cola = service.leer();
      expect(cola.length, 2);
      expect(cola.map((p) => p.clientUuid).toList(), ['uuid-1', 'uuid-3']);
    });

    test('actualizar reemplaza el pedido existente', () async {
      final original = _pedidoPendiente('uuid-1');
      await service.agregar(original);

      final conRetry = original.conRetryIncrementado();
      await service.actualizar(conRetry);

      final cola = service.leer();
      expect(cola.length, 1);
      expect(cola.first.reintentos, 1);
    });

    test('actualizar agrega si no existe', () async {
      final pedido = _pedidoPendiente('uuid-nuevo');
      await service.actualizar(pedido);

      final cola = service.leer();
      expect(cola.length, 1);
      expect(cola.first.clientUuid, 'uuid-nuevo');
    });

    test('limpiar vacía toda la cola', () async {
      await service.agregar(_pedidoPendiente('uuid-1'));
      await service.agregar(_pedidoPendiente('uuid-2'));
      await service.limpiar();

      expect(service.leer(), isEmpty);
    });

    test('eliminar el último pedido limpia la clave', () async {
      await service.agregar(_pedidoPendiente('uuid-1'));
      await service.eliminar('uuid-1');

      expect(service.leer(), isEmpty);
      expect(prefs.getString(OfflineQueueService.keyCola), isNull);
    });

    test('persiste entre instancias del servicio', () async {
      await service.agregar(_pedidoPendiente('uuid-persist'));

      // Crear una nueva instancia con las mismas prefs.
      final service2 = OfflineQueueService(prefs);
      final cola = service2.leer();
      expect(cola.length, 1);
      expect(cola.first.clientUuid, 'uuid-persist');
    });

    test('JSON inválido no rompe la lectura', () async {
      await prefs.setString(OfflineQueueService.keyCola, 'no-es-json{{{');
      expect(service.leer(), isEmpty);
    });
  });

  group('PedidoPendiente - modelo', () {
    test('agotado es true cuando reintentos >= maxReintentos', () {
      final pedido = _pedidoPendiente('uuid-1', reintentos: 3);
      expect(pedido.agotado, isTrue);
    });

    test('agotado es false cuando reintentos < maxReintentos', () {
      final pedido = _pedidoPendiente('uuid-1', reintentos: 2);
      expect(pedido.agotado, isFalse);
    });

    test('conRetryIncrementado suma 1 a reintentos', () {
      final pedido = _pedidoPendiente('uuid-1', reintentos: 1);
      final incrementado = pedido.conRetryIncrementado();
      expect(incrementado.reintentos, 2);
      expect(incrementado.clientUuid, 'uuid-1');
    });

    test('roundtrip JSON preserva todos los campos', () {
      final original = PedidoPendiente(
        clientUuid: 'uuid-test',
        items: [
          const PedidoPendienteItem(productoId: 'p1', cantidad: 3),
          const PedidoPendienteItem(productoId: 'p2', cantidad: 1),
        ],
        timestamp: DateTime(2025, 6, 15, 10, 30),
        reintentos: 2,
        clienteNombre: 'Cliente X',
        nota: 'Entregar antes del mediodía',
      );

      final json = original.toJson();
      final restaurado = PedidoPendiente.fromJson(json);

      expect(restaurado.clientUuid, original.clientUuid);
      expect(restaurado.items.length, 2);
      expect(restaurado.items[0].productoId, 'p1');
      expect(restaurado.items[0].cantidad, 3);
      expect(restaurado.reintentos, 2);
      expect(restaurado.clienteNombre, 'Cliente X');
      expect(restaurado.nota, 'Entregar antes del mediodía');
      expect(restaurado.timestamp, original.timestamp);
    });
  });
}

PedidoPendiente _pedidoPendiente(
  String clientUuid, {
  List<String> productos = const ['p1'],
  int reintentos = 0,
}) {
  return PedidoPendiente(
    clientUuid: clientUuid,
    items: [
      for (final p in productos)
        PedidoPendienteItem(productoId: p, cantidad: 1),
    ],
    timestamp: DateTime.now(),
    reintentos: reintentos,
  );
}
