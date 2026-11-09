import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/format.dart';
import '../../core/refresco.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/alerta.dart';
import '../../services/alertas_service.dart';

/// Ancho a partir del cual el detalle se muestra en un rail lateral, como en
/// la web (`lg:grid-cols-[…_18rem]`). Por debajo se abre en un diálogo.
const _quiebreDetalle = 1024.0;

/// Bandeja de alertas del tablero (últimas 30, no leídas primero).
///
/// Se relee sola para que el dueño vea aparecer los avisos de stock sin tocar
/// nada. Pasar `intervalo: null` congela el sondeo (widget tests).
class AlertasPane extends ConsumerStatefulWidget {
  const AlertasPane({super.key, this.intervalo = kSondeoMuyLento});

  final Duration? intervalo;

  @override
  ConsumerState<AlertasPane> createState() => _AlertasPaneState();
}

class _AlertasPaneState extends ConsumerState<AlertasPane>
    with RefrescoAutomatico<AlertasPane> {
  Alerta? _seleccionada;

  @override
  Duration? get intervalo => widget.intervalo;

  @override
  void refrescar() {
    ref.invalidate(alertasProvider);
  }

  void _seleccionar(Alerta alerta, {required bool enRail}) {
    setState(() => _seleccionada = alerta);
    if (!enRail) _abrirDetalle();
  }

  Future<void> _abrirDetalle() async {
    await showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400, maxHeight: 520),
          child: _TarjetaDetalle(
            child: _DetalleAlerta(
              alerta: _seleccionada!,
              onMarcarLeida: () => _marcar(_seleccionada!, dialogo: dialogo),
              onCerrar: () {
                if (dialogo.mounted) Navigator.of(dialogo).pop();
              },
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _marcar(Alerta alerta, {BuildContext? dialogo}) async {
    try {
      await ref.read(alertasServiceProvider).marcarLeida(alerta.id);
      ref.invalidate(alertasProvider);
      if (dialogo?.mounted == true) Navigator.of(dialogo!).pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('No se pudo marcar la alerta.')),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final alertas = ref.watch(alertasProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreDetalle;
        return alertas.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.message
                      : 'No se pudieron cargar las alertas.',
                  style: TextStyle(fontSize: 13, color: tokens.terra),
                ),
                const SizedBox(height: 16),
                FilledButton.tonal(
                  key: const Key('alertas_reintentar'),
                  onPressed: () => ref.invalidate(alertasProvider),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          ),
          data: (lista) {
            final sinLeer = lista.where((a) => !a.leida).length;
            final elegido =
                lista.where((a) => a.id == _seleccionada?.id).firstOrNull;

            final listado = _Listado(
              alertas: lista,
              seleccion: _seleccionada?.id,
              sinLeer: sinLeer,
              onElegir: (a) => _seleccionar(a, enRail: enRail),
              onMarcarLeida: (a) => _marcar(a),
            );

            if (!enRail) return listado;

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: listado),
                const SizedBox(width: 16),
                SizedBox(
                  width: 320,
                  child: elegido == null
                      ? Text(
                          'Elegí una alerta para ver su detalle.',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: tokens.muted,
                          ),
                        )
                      : _TarjetaDetalle(
                          child: _DetalleAlerta(
                            alerta: elegido,
                            onMarcarLeida: elegido.leida
                                ? null
                                : () => _marcar(elegido),
                            onCerrar: null,
                          ),
                        ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

class _Listado extends StatelessWidget {
  const _Listado({
    required this.alertas,
    required this.seleccion,
    required this.sinLeer,
    required this.onElegir,
    required this.onMarcarLeida,
  });

  final List<Alerta> alertas;
  final String? seleccion;
  final int sinLeer;
  final void Function(Alerta) onElegir;
  final void Function(Alerta) onMarcarLeida;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    if (alertas.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'No hay alertas.',
            key: const Key('alertas_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }

    return Tarjeta(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: ListView.separated(
              key: const Key('alertas_lista'),
              padding: EdgeInsets.zero,
              itemCount: alertas.length,
              separatorBuilder: (_, _) =>
                  Divider(height: 1, thickness: 1, color: tokens.line),
              itemBuilder: (context, index) {
                final alerta = alertas[index];
                return _FilaAlerta(
                  key: Key('alerta_${alerta.id}'),
                  alerta: alerta,
                  seleccionado: seleccion == alerta.id,
                  onTap: () => onElegir(alerta),
                  onMarcarLeida: alerta.leida ? null : () => onMarcarLeida(alerta),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: tokens.paper2,
              border: Border(top: BorderSide(color: tokens.line)),
            ),
            child: Text(
              '$sinLeer sin leer de ${alertas.length}',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: tokens.muted),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fila de alerta
// ---------------------------------------------------------------------------

class _FilaAlerta extends StatefulWidget {
  const _FilaAlerta({
    super.key,
    required this.alerta,
    required this.seleccionado,
    required this.onTap,
    required this.onMarcarLeida,
  });

  final Alerta alerta;
  final bool seleccionado;
  final VoidCallback onTap;
  final VoidCallback? onMarcarLeida;

  @override
  State<_FilaAlerta> createState() => _FilaAlertaState();
}

class _FilaAlertaState extends State<_FilaAlerta> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final alerta = widget.alerta;

    final (icono, colorIcono, etiqueta, colorPildora) = switch (alerta.tipo) {
      'stock_bajo' => (
          Icons.warning_amber_outlined,
          tokens.terra,
          'Stock bajo',
          tokens.terra,
        ),
      'vencimiento' => (
          Icons.schedule,
          tokens.naranja,
          'Vencimiento',
          tokens.naranja,
        ),
      _ => (
          Icons.info_outline,
          tokens.muted,
          'Info',
          tokens.muted,
        ),
    };

    final fondo = widget.seleccionado
        ? tokens.okBg
        : (_encima ? tokens.paper : null);

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(
        onTap: widget.onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: fondo,
          child: Row(
            children: [
              Icon(icono, size: 18, color: colorIcono),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      alerta.mensaje,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: alerta.leida ? tokens.muted : tokens.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      fechaCorta(alerta.creada),
                      style: TextStyle(fontSize: 11, color: tokens.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Pildora(etiqueta, color: colorPildora),
              if (widget.onMarcarLeida != null) ...[
                const SizedBox(width: 6),
                TextButton(
                  key: Key('alerta_leer_${alerta.id}'),
                  onPressed: widget.onMarcarLeida,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 28),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                  child: const Text('Marcar leída'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

class _TarjetaDetalle extends StatelessWidget {
  const _TarjetaDetalle({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 2, color: tokens.naranja),
          Flexible(child: child),
        ],
      ),
    );
  }
}

class _DetalleAlerta extends StatelessWidget {
  const _DetalleAlerta({
    required this.alerta,
    required this.onMarcarLeida,
    this.onCerrar,
  });

  final Alerta alerta;
  final VoidCallback? onMarcarLeida;
  final VoidCallback? onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    final (etiqueta, colorPildora) = switch (alerta.tipo) {
      'stock_bajo' => ('Stock bajo', tokens.terra),
      'vencimiento' => ('Vencimiento', tokens.naranja),
      _ => ('Info', tokens.muted),
    };

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Detalle de alerta',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (onCerrar != null)
                TextButton(
                  onPressed: onCerrar,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 28),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    foregroundColor: tokens.muted,
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                  child: const Text('Cerrar'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Pildora(etiqueta, color: colorPildora),
          const SizedBox(height: 10),
          Text(
            alerta.mensaje,
            style: const TextStyle(fontSize: 13, height: 1.4),
          ),
          const SizedBox(height: 8),
          Text(
            'Creada: ${fechaCorta(alerta.creada)}',
            style: TextStyle(fontSize: 12, color: tokens.muted),
          ),
          const SizedBox(height: 4),
          Pildora(
            alerta.leida ? 'Leída' : 'Sin leer',
            color: alerta.leida ? tokens.ok : tokens.ambar,
          ),
          if (onMarcarLeida != null) ...[
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onMarcarLeida,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(38),
                textStyle: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: const Text('Marcar como leída'),
            ),
          ],
        ],
      ),
    );
  }
}
