import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/format.dart';
import '../models/cobro.dart';
import '../models/ticket.dart';

/// Ticket en rollo de 80 mm (mismo ancho que la térmica de la web),
/// espejo del diálogo en pantalla, para la impresión del sistema.
/// Tipografía Courier 12, como en las impresoras térmicas reales.
Future<Uint8List> construirTicketPdf(Ticket ticket) async {
  final c = ticket.contenido;
  final base = pw.TextStyle(
    font: pw.Font.courier(),
    fontBold: pw.Font.courierBold(),
    fontSize: 12,
    color: PdfColors.black,
  );
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
            style: base.copyWith(
              fontSize: 14,
              fontWeight: pw.FontWeight.bold,
            ),
            textAlign: pw.TextAlign.center,
          ),
          pw.Text(
            'Comprobante Nº ${c.numero}',
            style: base,
            textAlign: pw.TextAlign.center,
          ),
          pw.Text(
            fechaCorta(c.fecha),
            style: base.copyWith(fontSize: 10),
            textAlign: pw.TextAlign.center,
          ),
          _separador(base),
          pw.Text('Cliente: ${c.cliente}', style: base),
          _separador(base),
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
                  width: 64,
                  child: pw.Text(
                    moneda(item.subtotal),
                    style: base,
                    textAlign: pw.TextAlign.right,
                  ),
                ),
              ],
            ),
          _separador(base),
          pw.Text(
            'TOTAL: ${moneda(c.total)}',
            style: base.copyWith(fontSize: 13, fontWeight: pw.FontWeight.bold),
          ),
          pw.Text('Pago: ${_formaPagoLabel(c.formaPago)}', style: base),
          pw.Text('Recibido: ${moneda(c.recibido)}', style: base),
          pw.Text('Vuelto: ${moneda(c.vuelto)}', style: base),
          if (c.pie.isNotEmpty) ...[
            _separador(base),
            pw.Text(
              c.pie,
              style: base.copyWith(fontSize: 10),
              textAlign: pw.TextAlign.center,
            ),
          ],
        ],
      ),
    ),
  );
  return doc.save();
}

pw.Widget _separador(pw.TextStyle base) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4),
      child: pw.Text(
        '-' * 26,
        style: base.copyWith(color: PdfColors.grey),
        textAlign: pw.TextAlign.center,
      ),
    );

String _formaPagoLabel(String apiValue) =>
    FormaPago.fromApi(apiValue)?.label ?? apiValue;
