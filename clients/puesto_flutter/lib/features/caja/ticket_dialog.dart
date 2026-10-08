import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/cobro.dart';
import '../../models/ticket.dart';
import '../../services/pedidos_service.dart';
import '../../services/printer_service.dart';

/// Vista previa del ticket de un cobro (`GET /api/v1/cobros/:id/ticket`)
/// con impresión por fallback del sistema (`PrinterService`). La térmica
/// queda para cuando se defina el hardware.
class TicketDialog extends ConsumerWidget {
  const TicketDialog({super.key, required this.cobroId});

  final String cobroId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticketAsync = ref.watch(ticketProvider(cobroId));
    final ticket = ticketAsync.value;
    return AlertDialog(
      key: const Key('ticket_dialogo'),
      title: const Text('Ticket'),
      content: SizedBox(width: 360, child: _cuerpo(context, ref, ticketAsync)),
      actions: [
        FilledButton.icon(
          key: const Key('ticket_imprimir'),
          onPressed: ticket == null ? null : () => _imprimir(context, ref, ticket),
          icon: const Icon(Icons.print_outlined),
          label: const Text('Imprimir'),
        ),
        TextButton(
          key: const Key('ticket_cerrar'),
          onPressed: () => Navigator.pop(context),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }

  Future<void> _imprimir(BuildContext context, WidgetRef ref, Ticket ticket) async {
    try {
      await ref.read(printerServiceProvider).imprimirTicket(ticket);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir la impresión.')),
      );
    }
  }

  Widget _cuerpo(BuildContext context, WidgetRef ref, AsyncValue<Ticket> ticketAsync) {
    if (ticketAsync.isLoading && !ticketAsync.hasValue) {
      return const Center(
        child: CircularProgressIndicator(key: Key('ticket_cargando')),
      );
    }
    final ticket = ticketAsync.value;
    if (ticket == null) {
      final error = ticketAsync.error;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            error is ApiException
                ? error.message
                : 'No se pudo cargar el ticket.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: const Key('ticket_reintentar'),
            onPressed: () => ref.invalidate(ticketProvider(cobroId)),
            child: const Text('Reintentar'),
          ),
        ],
      );
    }
    final c = ticket.contenido;
    final estilo = Theme.of(context)
        .textTheme
        .bodyMedium
        ?.copyWith(
          fontFamily: 'Courier New',
          fontFamilyFallback: const ['monospace'],
        );
    return SingleChildScrollView(
      child: Column(
        key: const Key('ticket_contenido'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(c.puesto, textAlign: TextAlign.center, style: estilo),
          Text(
            'Comprobante Nº ${c.numero}',
            textAlign: TextAlign.center,
            style: estilo,
          ),
          Text(
            fechaCorta(c.fecha),
            textAlign: TextAlign.center,
            style: estilo?.copyWith(fontSize: 11),
          ),
          const Divider(),
          Text('Cliente: ${c.cliente}', style: estilo),
          const Divider(),
          for (final item in c.items)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${cantidadNum(item.cantidad)} ${item.unidad} ${item.nombre}',
                    style: estilo,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(moneda(item.subtotal), style: estilo),
              ],
            ),
          const Divider(),
          Text('TOTAL: ${moneda(c.total)}', style: estilo),
          Text('Pago: ${_formaPagoLabel(c.formaPago)}', style: estilo),
          Text('Recibido: ${moneda(c.recibido)}', style: estilo),
          Text('Vuelto: ${moneda(c.vuelto)}', style: estilo),
          if (c.pie.isNotEmpty) ...[
            const Divider(),
            Text(c.pie, textAlign: TextAlign.center, style: estilo?.copyWith(fontSize: 11)),
          ],
        ],
      ),
    );
  }

  String _formaPagoLabel(String apiValue) =>
      FormaPago.fromApi(apiValue)?.label ?? apiValue;
}
