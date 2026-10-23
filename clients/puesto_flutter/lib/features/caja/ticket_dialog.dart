import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../models/cobro.dart';
import '../../models/ticket.dart';
import '../../services/pedidos_service.dart';
import '../../services/printer_service.dart';
import '../../services/impresion_termica_service.dart';

/// Vista previa del ticket de un cobro (`GET /api/v1/cobros/:id/ticket`)
/// con impresión directa a térmica Bluetooth/USB o fallback al sistema.
class TicketDialog extends ConsumerStatefulWidget {
  const TicketDialog({super.key, required this.cobroId});

  final String cobroId;

  @override
  ConsumerState<TicketDialog> createState() => _TicketDialogState();
}

class _TicketDialogState extends ConsumerState<TicketDialog> {
  bool _buscandoImpresoras = false;
  bool _conectando = false;
  bool _imprimiendoTermica = false;

  @override
  Widget build(BuildContext context) {
    final ticketAsync = ref.watch(ticketProvider(widget.cobroId));
    final ticket = ticketAsync.value;
    final termica = ref.watch(impresionTermicaServiceProvider);

    return AlertDialog(
      key: const Key('ticket_dialogo'),
      title: const Text('Ticket'),
      content: SizedBox(
        width: 400,
        child: _cuerpo(context, ref, ticketAsync),
      ),
      actions: [
        // Botón de impresión térmica directa
        if (termica.estaConectada)
          FilledButton.icon(
            key: const Key('ticket_imprimir_termica'),
            onPressed: ticket == null || _imprimiendoTermica
                ? null
                : () => _imprimirTermica(context, ref, ticket),
            icon: _imprimiendoTermica
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.bluetooth_connected),
            label: Text(_imprimiendoTermica ? 'Imprimiendo...' : 'Térmica'),
          ),
        // Botón para buscar/conectar impresora térmica
        OutlinedButton.icon(
          key: const Key('ticket_buscar_termica'),
          onPressed: _buscandoImpresoras || _conectando ? null : _mostrarDialogoImpresoras,
          icon: _buscandoImpresoras
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.bluetooth_searching),
          label: Text(termica.estaConectada
              ? 'Cambiar térmica'
              : 'Conectar térmica'),
        ),
        // Botón de impresión por sistema (fallback)
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

  Future<void> _imprimirTermica(
    BuildContext context,
    WidgetRef ref,
    Ticket ticket,
  ) async {
    setState(() => _imprimiendoTermica = true);
    try {
      await ref.read(impresionTermicaServiceProvider).imprimirTicket(ticket);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ticket impreso en térmica.')),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al imprimir: ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _imprimiendoTermica = false);
    }
  }

  Future<void> _mostrarDialogoImpresoras() async {
    setState(() => _buscandoImpresoras = true);

    try {
      final termica = ref.read(impresionTermicaServiceProvider);
      final impresoras = await termica.buscarImpresoras();

      if (!mounted) return;
      setState(() => _buscandoImpresoras = false);

      final seleccion = await showDialog<ImpresoraBluetooth>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Seleccionar impresora térmica'),
          content: SizedBox(
            width: 320,
            child: impresoras.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No se encontraron impresoras térmicas.\n'
                      'Asegúrate de que la impresora esté encendida y cerca.',
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: impresoras.length,
                    itemBuilder: (context, index) {
                      final impresora = impresoras[index];
                      return ListTile(
                        leading: const Icon(Icons.print),
                        title: Text(impresora.nombre),
                        subtitle: Text(impresora.macAddress),
                        onTap: () => Navigator.pop(context, impresora),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      );

      if (seleccion != null) {
        setState(() => _conectando = true);
        try {
          await termica.conectar(seleccion.macAddress);
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Conectado a ${seleccion.nombre}')),
          );
        } catch (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error al conectar: ${e.toString()}')),
          );
        } finally {
          if (mounted) setState(() => _conectando = false);
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _buscandoImpresoras = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al buscar impresoras: ${e.toString()}')),
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
            onPressed: () => ref.invalidate(ticketProvider(widget.cobroId)),
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
