import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../models/ticket.dart';
import 'ticket_pdf.dart';

/// Contrato común de impresión (MIGRATION.md §18). La térmica es una
/// integración de plataforma que se agrega cuando se conozca el hardware;
/// hasta entonces la única implementación es el fallback del sistema.
abstract class PrinterService {
  /// Envía el ticket al diálogo de impresión del sistema.
  Future<void> imprimirTicket(Ticket ticket);
}

class SystemPrinterService implements PrinterService {
  const SystemPrinterService();

  @override
  Future<void> imprimirTicket(Ticket ticket) async {
    await Printing.layoutPdf(
      name: 'Ticket ${ticket.contenido.numero}',
      onLayout: (format) => construirTicketPdf(ticket),
    );
  }
}

final printerServiceProvider = Provider<PrinterService>(
  (ref) => const SystemPrinterService(),
);
