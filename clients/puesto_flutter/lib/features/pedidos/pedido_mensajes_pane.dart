import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/mensajes.dart';
import '../../services/mensajes_service.dart';

/// Pestaña de mensajes dentro del detalle de un pedido. Muestra el hilo de
/// conversacion con el cliente y permite responder como negocio.
///
/// Hace polling cada [_kPollInterval] para refrescar los mensajes nuevos.
class PedidoMensajesPane extends ConsumerStatefulWidget {
  const PedidoMensajesPane({super.key, required this.pedidoId});

  final String pedidoId;

  @override
  ConsumerState<PedidoMensajesPane> createState() => _PedidoMensajesPaneState();
}

const Duration _kPollInterval = Duration(seconds: 10);

class _PedidoMensajesPaneState extends ConsumerState<PedidoMensajesPane> {
  final _controlador = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _timer;
  bool _enviando = false;
  String? _errorEnvio;

  @override
  void initState() {
    super.initState();
    _iniciarPolling();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controlador.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _iniciarPolling() {
    _timer = Timer.periodic(_kPollInterval, (_) {
      if (!mounted) return;
      ref.invalidate(mensajesDePedidoProvider(widget.pedidoId));
    });
  }

  Future<void> _enviar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty) return;
    setState(() {
      _enviando = true;
      _errorEnvio = null;
    });
    try {
      await ref.read(mensajesServiceProvider).enviar(widget.pedidoId, texto);
      _controlador.clear();
      ref.invalidate(mensajesDePedidoProvider(widget.pedidoId));
      ref.invalidate(conversacionesProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _errorEnvio = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _errorEnvio = 'No se pudo enviar el mensaje.');
      }
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hilo = ref.watch(mensajesDePedidoProvider(widget.pedidoId));
    return Column(
      children: [
        Expanded(
          child: hilo.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (error, _) => _ErrorMensajes(
              mensaje: error is ApiException
                  ? error.message
                  : 'No se pudieron cargar los mensajes.',
              onReintentar: () =>
                  ref.invalidate(mensajesDePedidoProvider(widget.pedidoId)),
            ),
            data: (pagina) => _HiloLista(
              key: const Key('pedido_mensajes_lista'),
              mensajes: pagina.mensajes,
              scrollController: _scrollController,
            ),
          ),
        ),
        const Divider(height: 1),
        _InputMensaje(
          controlador: _controlador,
          enviando: _enviando,
          error: _errorEnvio,
          onEnviar: _enviar,
        ),
      ],
    );
  }
}

class _ErrorMensajes extends StatelessWidget {
  const _ErrorMensajes({required this.mensaje, required this.onReintentar});

  final String mensaje;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            key: const Key('pedido_mensajes_reintentar'),
            onPressed: onReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}

class _HiloLista extends StatefulWidget {
  const _HiloLista({
    super.key,
    required this.mensajes,
    required this.scrollController,
  });

  final List<Mensaje> mensajes;
  final ScrollController scrollController;

  @override
  State<_HiloLista> createState() => _HiloListaState();
}

class _HiloListaState extends State<_HiloLista> {
  @override
  void initState() {
    super.initState();
    // Scroll al final tras el primer frame.
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollAlFinal());
  }

  @override
  void didUpdateWidget(covariant _HiloLista old) {
    super.didUpdateWidget(old);
    if (old.mensajes.length != widget.mensajes.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollAlFinal());
    }
  }

  void _scrollAlFinal() {
    if (widget.scrollController.hasClients) {
      widget.scrollController.animateTo(
        widget.scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.mensajes.isEmpty) {
      return const Center(
        child: Text('Todavia no hay mensajes en este pedido.'),
      );
    }
    final theme = Theme.of(context);
    return ListView.builder(
      controller: widget.scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      itemCount: widget.mensajes.length,
      itemBuilder: (context, index) {
        final m = widget.mensajes[index];
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
              crossAxisAlignment: esNegocio
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Text(
                  esNegocio ? 'Negocio' : 'Cliente',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
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
    if (createdAt.isEmpty) return '';
    final limpio = createdAt.split('+').first;
    final partes = limpio.split(' ');
    if (partes.length < 2) return limpio;
    final hora = partes[1];
    return hora.length >= 5 ? hora.substring(0, 5) : hora;
  }
}

class _InputMensaje extends StatelessWidget {
  const _InputMensaje({
    required this.controlador,
    required this.enviando,
    required this.error,
    required this.onEnviar,
  });

  final TextEditingController controlador;
  final bool enviando;
  final String? error;
  final Future<void> Function() onEnviar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(
        children: [
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                error!,
                key: const Key('pedido_mensajes_error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('pedido_mensajes_campo'),
                  controller: controlador,
                  minLines: 1,
                  maxLines: 3,
                  enabled: !enviando,
                  decoration: const InputDecoration(
                    hintText: 'Escribi un mensaje...',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => onEnviar(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                key: const Key('pedido_mensajes_enviar'),
                onPressed: enviando ? null : onEnviar,
                child: enviando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
