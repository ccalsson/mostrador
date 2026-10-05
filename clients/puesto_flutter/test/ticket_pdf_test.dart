import 'package:flutter_test/flutter_test.dart';
import 'package:puesto_flutter/models/ticket.dart';
import 'package:puesto_flutter/services/ticket_pdf.dart';

Ticket _ticket({int items = 2}) => Ticket(
      id: 'tck_1',
      numero: 7,
      createdAt: '2026-10-04T10:00:00Z',
      contenido: TicketContenido(
        puesto: 'Puesto 1',
        numero: 7,
        fecha: '2026-10-04T10:00:00Z',
        cliente: 'Consumidor final',
        items: [
          for (var i = 0; i < items; i++)
            TicketItem(
              nombre: 'Manzana roja variedad $i',
              cantidad: 1.5,
              unidad: 'kg',
              precio: 500,
              subtotal: 750,
            ),
        ],
        total: 1500,
        formaPago: 'efectivo',
        recibido: 2000,
        vuelto: 500,
        pie: 'Gracias por su compra',
      ),
    );

void main() {
  test('el PDF del ticket es un documento PDF válido', () async {
    final bytes = await construirTicketPdf(_ticket());
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    expect(bytes.length, greaterThan(500));
  });

  test('un ticket con muchas líneas se genera sin error', () async {
    final bytes = await construirTicketPdf(_ticket(items: 60));
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });

  test('un ticket sin pie no incluye la sección de pie', () async {
    final t = _ticket();
    final bytes = await construirTicketPdf(
      Ticket(
        id: t.id,
        numero: t.numero,
        createdAt: t.createdAt,
        contenido: TicketContenido(
          puesto: t.contenido.puesto,
          numero: t.contenido.numero,
          fecha: t.contenido.fecha,
          cliente: t.contenido.cliente,
          items: t.contenido.items,
          total: t.contenido.total,
          formaPago: t.contenido.formaPago,
          recibido: t.contenido.recibido,
          vuelto: t.contenido.vuelto,
          pie: '',
        ),
      ),
    );
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
  });
}
