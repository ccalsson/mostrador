import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/mensajes.dart';
import '../../services/mensajes_service.dart';

/// Pestaña Mensajes del escritorio del dueño: listado de conversaciones por
/// pedido (con contador de sin-leer) y diálogo para abrir el hilo y responder.
class MensajesTab extends ConsumerWidget {
  const MensajesTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estado = ref.watch(conversacionesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Conversaciones con clientes',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              IconButton(
                key: const Key('mensajes_refresh'),
                tooltip: 'Actualizar',
                onPressed: () => ref.invalidate(conversacionesProvider),
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: estado.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudieron cargar las conversaciones.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    key: const Key('mensajes_reintentar'),
                    onPressed: () => ref.invalidate(conversacionesProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text('Todavía no hay mensajes de clientes.'),
                );
              }
              return ListView.separated(
                key: const Key('mensajes_lista'),
                itemCount: lista.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) =>
                    _ConversacionTile(conversacion: lista[index]),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ConversacionTile extends StatelessWidget {
  const _ConversacionTile({required this.conversacion});

  final ConversacionResumen conversacion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sinLeer = conversacion.sinLeer;
    return ListTile(
      key: Key('mensajes_conv_${conversacion.pedidoId}'),
      leading: CircleAvatar(
        backgroundColor:
            sinLeer > 0 ? theme.colorScheme.primary : null,
        foregroundColor:
            sinLeer > 0 ? theme.colorScheme.onPrimary : null,
        child: Text(
          _iniciales(conversacion.clienteNombre),
          style: const TextStyle(fontSize: 12),
        ),
      ),
      title: Text(
        conversacion.clienteNombre,
        style: TextStyle(
          fontWeight: sinLeer > 0 ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      subtitle: Text(
        '${_estadoLabel(conversacion.estado)} · '
        '${conversacion.ultimoDe == 'negocio' ? 'Vos: ' : ''}'
        '${conversacion.ultimo}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            _horaRelativa(conversacion.ultimoAt),
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          if (sinLeer > 0) ...[
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$sinLeer',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onErrorContainer,
                ),
              ),
            ),
          ],
        ],
      ),
      onTap: () => mostrarHiloMensajes(context, conversacion),
    );
  }

  static String _iniciales(String nombre) {
    final partes = nombre.trim().split(RegExp(r'\s+'));
    if (partes.isEmpty || partes.first.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return '${partes[0].substring(0, 1)}${partes[1].substring(0, 1)}'
        .toUpperCase();
  }

  static String _estadoLabel(String estado) => switch (estado) {
        'borrador' => 'Borrador',
        'enviado' => 'Enviado',
        'en_preparacion' => 'En preparación',
        'listo' => 'Listo',
        'cobrado' => 'Cobrado',
        'entregado' => 'Entregado',
        'anulado' => 'Anulado',
        _ => estado,
      };

  /// `2026-10-16 12:34:56+00` → `HH:MM` para el mismo día, `DD/MM` si no.
  static String _horaRelativa(String createdAt) {
    if (createdAt.isEmpty) return '';
    final limpio = createdAt.split('+').first;
    final partes = limpio.split(' ');
    if (partes.length < 2) return limpio;
    final hoy = DateTime.now().toIso8601String().split('T').first;
    if (partes[0] == hoy) {
      final hora = partes[1];
      return hora.length >= 5 ? hora.substring(0, 5) : hora;
    }
    final ymd = partes[0].split('-');
    if (ymd.length == 3) return '${ymd[2]}/${ymd[1]}';
    return partes[0];
  }
}

Future<void> mostrarHiloMensajes(
  BuildContext context,
  ConversacionResumen conversacion,
) {
  return showDialog<void>(
    context: context,
    builder: (_) => _HiloDialog(conversacion: conversacion),
  );
}

class _HiloDialog extends ConsumerStatefulWidget {
  const _HiloDialog({required this.conversacion});

  final ConversacionResumen conversacion;

  @override
  ConsumerState<_HiloDialog> createState() => _HiloDialogState();
}

class _HiloDialogState extends ConsumerState<_HiloDialog> {
  final _controlador = TextEditingController();
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      await ref
          .read(mensajesServiceProvider)
          .enviar(widget.conversacion.pedidoId, texto);
      _controlador.clear();
      ref.invalidate(mensajesDePedidoProvider(widget.conversacion.pedidoId));
      ref.invalidate(conversacionesProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hilo =
        ref.watch(mensajesDePedidoProvider(widget.conversacion.pedidoId));
    return AlertDialog(
      contentPadding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      title: Text(widget.conversacion.clienteNombre),
      content: SizedBox(
        width: 480,
        height: 420,
        child: Column(
          children: [
            Expanded(
              child: hilo.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Text(error is ApiException
                      ? error.message
                      : 'No se pudo cargar el hilo.'),
                ),
                data: (pagina) => _HiloLista(mensajes: pagina.mensajes),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          key: const Key('mensajes_respuesta_campo'),
                          controller: _controlador,
                          minLines: 1,
                          maxLines: 3,
                          enabled: !_enviando,
                          decoration: const InputDecoration(
                            hintText: 'Escribí una respuesta…',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                          onSubmitted: (_) => _enviar(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        key: const Key('mensajes_respuesta_enviar'),
                        onPressed: _enviando ? null : _enviar,
                        child: _enviando
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2),
                              )
                            : const Text('Enviar'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }
}

class _HiloLista extends StatelessWidget {
  const _HiloLista({required this.mensajes});

  final List<Mensaje> mensajes;

  @override
  Widget build(BuildContext context) {
    if (mensajes.isEmpty) {
      return const Center(child: Text('Todavía no hay mensajes en este pedido.'));
    }
    final theme = Theme.of(context);
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: mensajes.length,
      itemBuilder: (context, index) {
        final m = mensajes[index];
        final esNegocio = m.emisor == 'negocio';
        return Align(
          alignment:
              esNegocio ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            constraints: const BoxConstraints(maxWidth: 340),
            decoration: BoxDecoration(
              color: esNegocio
                  ? theme.colorScheme.primaryContainer
                  : theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment:
                  esNegocio ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Text(m.cuerpo),
                const SizedBox(height: 2),
                Text(
                  _horaCorta(m.createdAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static String _horaCorta(String createdAt) {
    final limpio = createdAt.split('+').first;
    final partes = limpio.split(' ');
    if (partes.length < 2) return limpio;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}
