import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/suscripcion.dart';
import '../../services/suscripcion_service.dart';

/// Sección "Suscripción y Legal" del Dueño (contrato Parte A). Muestra el
/// resumen del backend, permite leer el contrato vigente y su historial, y
/// registrar la aceptación de la versión pendiente. La aceptación es
/// online-only: sin backend no se registra nada localmente.
class SuscripcionPane extends ConsumerStatefulWidget {
  const SuscripcionPane({super.key});

  @override
  ConsumerState<SuscripcionPane> createState() => _SuscripcionPaneState();
}

class _SuscripcionPaneState extends ConsumerState<SuscripcionPane> {
  bool _aceptando = false;
  bool _cargandoDetalle = false;

  Future<void> _aceptarPendiente(SuscripcionResumen resumen) async {
    final pendiente = resumen.pendiente;
    if (!pendiente.aceptable) return;
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _aceptando = true);
    try {
      await ref.read(suscripcionServiceProvider).aceptarContrato(
            documentoId: pendiente.documentoId!,
            version: pendiente.version!,
            hash: pendiente.hash!,
          );
      if (!mounted) return;
      setState(() => _aceptando = false);
      mensajero.showSnackBar(
        SnackBar(content: Text('Aceptaste la versión ${pendiente.version}.')),
      );
      ref.invalidate(suscripcionProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _aceptando = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
      // 409 version_obsoleta / hash_mismatch: la copia local quedó vieja;
      // el refresco vuelve a consultar la pendiente vigente.
      if (error is ConflictException) ref.invalidate(suscripcionProvider);
    }
  }

  Future<void> _verContrato() async {
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _cargandoDetalle = true);
    try {
      final contrato =
          await ref.read(suscripcionServiceProvider).obtenerContrato();
      if (!mounted) return;
      setState(() => _cargandoDetalle = false);
      await showDialog<void>(
        context: context,
        builder: (_) => _DialogoDocumento(contrato: contrato),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _cargandoDetalle = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _verHistorial() async {
    final mensajero = ScaffoldMessenger.of(context);
    setState(() => _cargandoDetalle = true);
    try {
      final entradas =
          await ref.read(suscripcionServiceProvider).obtenerHistorial();
      if (!mounted) return;
      setState(() => _cargandoDetalle = false);
      await showDialog<void>(
        context: context,
        builder: (_) => _DialogoHistorial(entradas: entradas),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _cargandoDetalle = false);
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final resumenAsync = ref.watch(suscripcionProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Suscripción',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => ref.invalidate(suscripcionProvider),
                tooltip: 'Actualizar',
              ),
            ],
          ),
        ),
        if (_cargandoDetalle) const LinearProgressIndicator(),
        Expanded(
          child: resumenAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => error is NotFoundException
                // 404 sin_suscripcion: estado honesto, no es un error de red.
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'La suscripción no está disponible todavía.',
                          key: Key('suscripcion_no_disponible'),
                        ),
                        const SizedBox(height: 16),
                        FilledButton.tonal(
                          onPressed: () => ref.invalidate(suscripcionProvider),
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
                  )
                : Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('Error al cargar la suscripción.'),
                        const SizedBox(height: 16),
                        FilledButton.tonal(
                          onPressed: () => ref.invalidate(suscripcionProvider),
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
                  ),
            data: (resumen) => ListView(
              key: const Key('suscripcion_lista'),
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                _tarjeta([
                  ListTile(
                    leading: const Icon(Icons.workspace_premium_outlined),
                    title: Text(resumen.plan.nombre),
                    subtitle: Text(
                        'Plan: ${resumen.plan.codigo}\nEstado: ${resumen.estado}'),
                    isThreeLine: true,
                  ),
                  if (resumen.inicio != null || resumen.proximaRenovacion != null)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.event_repeat_outlined),
                      title: Text(
                        [
                          if (resumen.inicio != null)
                            'Inicio: ${_fecha(resumen.inicio)}',
                          if (resumen.proximaRenovacion != null)
                            'Próxima renovación: ${_fecha(resumen.proximaRenovacion)}',
                        ].join('\n'),
                      ),
                    ),
                  if (resumen.precioVigente != null)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.payments_outlined),
                      title: Text(
                        '${resumen.precioVigente!.moneda} ${resumen.precioVigente!.monto}'
                        ' · ${resumen.precioVigente!.periodo}',
                      ),
                    ),
                ]),
                _tarjeta([
                  const ListTile(
                    leading: Icon(Icons.extension_outlined),
                    title: Text('Add-ons'),
                  ),
                  if (resumen.addons.isEmpty)
                    const ListTile(
                      dense: true,
                      title: Text('Sin add-ons contratados.'),
                    )
                  else
                    ...resumen.addons.map(
                      (addon) => ListTile(
                        dense: true,
                        title: Text(addon.nombre),
                        subtitle: Text(addon.detalle ?? addon.codigo),
                        trailing: Text(
                          addon.activo ? 'Activo' : 'Inactivo',
                          style: TextStyle(
                            color: addon.activo
                                ? theme.colorScheme.primary
                                : theme.colorScheme.outline,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ]),
                if (resumen.condicionesComerciales != null)
                  _tarjeta([
                    ListTile(
                      leading: const Icon(Icons.description_outlined),
                      title: const Text('Condiciones comerciales'),
                      subtitle: Text(
                        [
                          resumen.condicionesComerciales!.resumen,
                          if (resumen.condicionesComerciales!.actualizado != null)
                            'Actualizado: ${_fecha(resumen.condicionesComerciales!.actualizado)}',
                        ].join('\n'),
                      ),
                    ),
                  ]),
                _tarjeta([
                  const ListTile(
                    leading: Icon(Icons.gavel_outlined),
                    title: Text('Contrato'),
                  ),
                  if (resumen.contratoVigente == null)
                    const ListTile(
                      dense: true,
                      title: Text('Sin contrato publicado.'),
                    )
                  else ...[
                    ListTile(
                      dense: true,
                      title: Text(
                        '${resumen.contratoVigente!.documentoId} · '
                        'versión ${resumen.contratoVigente!.version} · '
                        '${resumen.contratoVigente!.estado}',
                      ),
                      subtitle: Text(
                        resumen.contratoVigente!.aceptadoPorMi
                            ? 'Aceptado por vos el ${_fecha(resumen.contratoVigente!.fechaAceptacion)}'
                            : 'Sin aceptación registrada tuya',
                      ),
                    ),
                    if (resumen.pendiente.aceptable)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Hay una versión pendiente: '
                              '${resumen.pendiente.documentoId} · '
                              'versión ${resumen.pendiente.version}',
                              style: theme.textTheme.bodyMedium,
                            ),
                            const SizedBox(height: 8),
                            FilledButton(
                              key: const Key('suscripcion_aceptar'),
                              onPressed: _aceptando
                                  ? null
                                  : () => _aceptarPendiente(resumen),
                              child: Text(
                                _aceptando
                                    ? 'Aceptando…'
                                    : 'Aceptar versión ${resumen.pendiente.version}',
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                    child: Row(
                      children: [
                        TextButton(
                          key: const Key('suscripcion_ver_contrato'),
                          onPressed: _cargandoDetalle ? null : _verContrato,
                          child: const Text('Ver contrato'),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          key: const Key('suscripcion_ver_historial'),
                          onPressed: _cargandoDetalle ? null : _verHistorial,
                          child: const Text('Ver historial'),
                        ),
                      ],
                    ),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _tarjeta(List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        clipBehavior: Clip.antiAlias,
        child: Column(children: children),
      );
}

class _DialogoDocumento extends StatelessWidget {
  const _DialogoDocumento({required this.contrato});

  final ContratoDocumento contrato;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(contrato.titulo),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView(
          shrinkWrap: true,
          children: [
            Text(
              [
                'Versión ${contrato.version} · ${contrato.estado}',
                if (contrato.fechaVigencia != null)
                  'Vigente desde ${_fecha(contrato.fechaVigencia)}',
              ].join('\n'),
            ),
            Text(
              contrato.hash,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const Divider(),
            _contenido(contrato.contenido),
            for (final anexo in contrato.anexos) ...[
              const Divider(),
              Text(
                'Anexo: ${anexo.titulo} · v${anexo.version}',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              _contenido(anexo.contenido),
            ],
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

  Widget _contenido(ContenidoDocumento contenido) => contenido.esPdfUrl
      ? SelectableText('El documento está publicado en: ${contenido.valor}')
      : SelectableText(contenido.valor);
}

class _DialogoHistorial extends StatelessWidget {
  const _DialogoHistorial({required this.entradas});

  final List<EntradaHistorial> entradas;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Historial del contrato'),
      content: SizedBox(
        width: double.maxFinite,
        child: entradas.isEmpty
            ? const Text('Sin entradas de historial.')
            : ListView(
                shrinkWrap: true,
                children: [
                  for (final entrada in entradas)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        entrada.tipo == 'anexo'
                            ? Icons.attach_file
                            : Icons.gavel_outlined,
                      ),
                      title: Text(
                          '${entrada.documentoId} · v${entrada.version} · ${entrada.tipo}'),
                      subtitle: Text(
                        [
                          '${entrada.estado} · desde ${_fecha(entrada.fechaDesde)}',
                          if (entrada.fechaHasta != null)
                            'hasta ${_fecha(entrada.fechaHasta)}',
                          if (entrada.aceptacion != null)
                            'Aceptada por ${entrada.aceptacion!.aceptadoPor ?? '—'} '
                                'el ${_fecha(entrada.aceptacion!.fecha)}',
                        ].join('\n'),
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

/// Las fechas de Torre llegan en ISO (`2026-10-07T15:30:00Z`): se muestra
/// `2026-10-07 15:30` sin depender de locales.
String _fecha(String? iso) {
  if (iso == null) return '—';
  final legible = iso.replaceFirst('T', ' ');
  return legible.length >= 16 ? legible.substring(0, 16) : legible;
}
