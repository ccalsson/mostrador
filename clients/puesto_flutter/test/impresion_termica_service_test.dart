import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/impresion_termica_service.dart';

Ticket _crearTicketPrueba() {
  return Ticket(
    id: 'tck_1',
    numero: 42,
    contenido: const TicketContenido(
      puesto: 'Puesto 1',
      numero: 42,
      fecha: '2026-10-20T14:30:00Z',
      cliente: 'Consumidor Final',
      items: [
        TicketItem(
          nombre: 'Manzana',
          cantidad: 2,
          unidad: 'kg',
          precio: 500,
          subtotal: 1000,
        ),
        TicketItem(
          nombre: 'Pan',
          cantidad: 1,
          unidad: 'kg',
          precio: 800,
          subtotal: 800,
        ),
      ],
      total: 1800,
      formaPago: 'efectivo',
      recibido: 2000,
      vuelto: 200,
      pie: 'Gracias por su compra',
    ),
    createdAt: '2026-10-20T14:30:00Z',
  );
}

void main() {
  group('ImpresionTermicaFake', () {
    test('buscarImpresoras devuelve la lista configurada', () async {
      final impresoras = [
        const ImpresoraBluetooth(macAddress: 'AA:BB:CC:DD:EE:01', nombre: 'Impresora 1'),
        const ImpresoraBluetooth(macAddress: 'AA:BB:CC:DD:EE:02', nombre: 'Impresora 2'),
      ];
      final service = ImpresionTermicaFake(impresoras: impresoras);

      final resultado = await service.buscarImpresoras();

      expect(resultado, hasLength(2));
      expect(resultado[0].nombre, 'Impresora 1');
      expect(resultado[1].macAddress, 'AA:BB:CC:DD:EE:02');
    });

    test('conectar establece la impresora como conectada', () async {
      final impresoras = [
        const ImpresoraBluetooth(macAddress: 'AA:BB:CC:DD:EE:01', nombre: 'Mi Impresora'),
      ];
      final service = ImpresionTermicaFake(impresoras: impresoras);

      expect(service.estaConectada, isFalse);
      expect(service.nombreImpresoraConectada(), isNull);

      await service.conectar('AA:BB:CC:DD:EE:01');

      expect(service.estaConectada, isTrue);
      expect(service.nombreImpresoraConectada(), 'Mi Impresora');
    });

    test('conectar con error lanza excepción', () async {
      final service = ImpresionTermicaFake(
        errorConectar: Exception('Bluetooth no disponible'),
      );

      expect(
        () => service.conectar('AA:BB:CC:DD:EE:01'),
        throwsA(isA<Exception>()),
      );
      expect(service.estaConectada, isFalse);
    });

    test('imprimirTicket agrega el ticket a la lista de impresos', () async {
      final impresoras = [
        const ImpresoraBluetooth(macAddress: 'AA:BB:CC:DD:EE:01', nombre: 'Impresora'),
      ];
      final service = ImpresionTermicaFake(impresoras: impresoras);
      await service.conectar('AA:BB:CC:DD:EE:01');

      final ticket = _crearTicketPrueba();
      await service.imprimirTicket(ticket);

      expect(service.ticketsImpresos, hasLength(1));
      expect(service.ticketsImpresos[0].numero, 42);
      expect(service.ticketsImpresos[0].contenido.total, 1800);
    });

    test('imprimirTicket sin conexión lanza excepción', () async {
      final service = ImpresionTermicaFake();
      final ticket = _crearTicketPrueba();

      expect(
        () => service.imprimirTicket(ticket),
        throwsA(isA<Exception>()),
      );
      expect(service.ticketsImpresos, isEmpty);
    });

    test('desconectar limpia el estado de conexión', () async {
      final impresoras = [
        const ImpresoraBluetooth(macAddress: 'AA:BB:CC:DD:EE:01', nombre: 'Impresora'),
      ];
      final service = ImpresionTermicaFake(impresoras: impresoras);
      await service.conectar('AA:BB:CC:DD:EE:01');

      expect(service.estaConectada, isTrue);

      await service.desconectar();

      expect(service.estaConectada, isFalse);
      expect(service.nombreImpresoraConectada(), isNull);
    });

    test('guardar y obtener impresora preferida', () async {
      final service = ImpresionTermicaFake();

      final preferida = await service.obtenerImpresoraPreferida();
      expect(preferida, isNull);

      await service.guardarImpresoraPreferida('AA:BB:CC:DD:EE:99');

      final guardada = await service.obtenerImpresoraPreferida();
      expect(guardada, 'AA:BB:CC:DD:EE:99');
      expect(service.impresoraPreferidaGuardada, 'AA:BB:CC:DD:EE:99');
    });
  });

  group('ImpresoraBluetooth', () {
    test('toString muestra nombre y MAC', () {
      const impresora = ImpresoraBluetooth(
        macAddress: 'AA:BB:CC:DD:EE:FF',
        nombre: 'Mi Térmica',
      );

      expect(impresora.toString(), contains('Mi Térmica'));
      expect(impresora.toString(), contains('AA:BB:CC:DD:EE:FF'));
    });
  });
}
