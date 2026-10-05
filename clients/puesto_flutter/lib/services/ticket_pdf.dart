import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/format.dart';
import '../models/cobro.dart';
import '../models/ticket.dart';

/// Ticket en rollo de 80 mm (mismo ancho que la térmica de la web),
/// espejo del diálogo en pantalla, para la impresión del sistema.
Future<Uint8List> construirTicketPdf(Ticket ticket) async {
  final c = ticket.contenido;
  const base = pw.TextStyle(fontSize: 9);
  final doc = pw.Document();
  // Page (no MultiPage): el rollo 80 mm es una sola página de altura
  // variable; MultiPage exige una altura de página finita.
  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.roll80,
      margin: const pw.EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      build: (context) => pw.Column(
        children: [
          pw.Text(
            c.puesto,
            style: base.copyWith(fontSize: 11, fontWeight: pw.FontWeight.bold),
            textAlign: pw.TextAlign.center,
          ),
          pw.Text(
            'Comprobante Nº ${c.numero}',
            style: base,
            textAlign: pw.TextAlign.center,
          ),
          pw.Text(
            fechaCorta(c.fecha),
            style: base.copyWith(fontSize: 7.5),
            textAlign: pw.TextAlign.center,
          ),
          pw.Divider(),
          pw.Text('Cliente: ${c.cliente}', style: base),
          pw.Divider(),
          for (final item in c.items)
            pw.Row(
              children: [
                pw.Expanded(
                  child: pw.Text(
                    '${cantidadNum(item.cantidad)} ${item.unidad} ${item.nombre}',
                    style: base,
                  ),
                ),
                pw.SizedBox(
                  width: 50,
                  child: pw.Text(
                    moneda(item.subtotal),
                    style: base,
                    textAlign: pw.TextAlign.right,
                  ),
                ),
              ],
            ),
          pw.Divider(),
          pw.Text(
            'TOTAL: ${moneda(c.total)}',
            style: base.copyWith(fontWeight: pw.FontWeight.bold),
          ),
          pw.Text('Pago: ${_formaPagoLabel(c.formaPago)}', style: base),
          pw.Text('Recibido: ${moneda(c.recibido)}', style: base),
          pw.Text('Vuelto: ${moneda(c.vuelto)}', style: base),
          if (c.pie.isNotEmpty) ...[
            pw.Divider(),
            pw.Text(
              c.pie,
              style: base.copyWith(fontSize: 7.5),
              textAlign: pw.TextAlign.center,
            ),
          ],
        ],
      ),
    ),
  );
  return doc.save();
}

String _formaPagoLabel(String apiValue) =>
    FormaPago.fromApi(apiValue)?.label ?? apiValue;
