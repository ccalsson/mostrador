import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/staff_session.dart';
import '../../models/suscripcion.dart';
import '../../services/suscripcion_service.dart';
import '../shell/adaptive_shell.dart';

/// Puerta legal: si hay documentos pendientes de aceptación, bloquea el
/// acceso al shell y muestra una pantalla completa con la lista de pendientes
/// y un botón "Aceptar y continuar" por cada uno. Cuando no hay pendientes
/// (o ya se aceptaron todos), muestra [child] (por defecto [AdaptiveShell]).
///
/// El gate sólo se aplica al rol dueño (admin); vendedor y cajero pasan
/// directo al shell sin bloqueo legal.
class LegalGate extends ConsumerWidget {
  const LegalGate({super.key, required this.rol, this.child});

  final Rol rol;

  /// Widget a mostrar cuando no hay pendientes. Por defecto [AdaptiveShell].
  /// Se expone como parámetro para facilitar tests y permitir reutilización.
  final Widget? child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shell = child ?? AdaptiveShell(rol: rol);

    // Sólo el dueño (admin) debe aceptar documentos legales. Los demás roles
    // pasan directo al shell sin gate.
    if (rol != Rol.admin) {
      return shell;
    }

    final suscripcionAsync = ref.watch(suscripcionProvider);

    return suscripcionAsync.when(
      loading: () => const _PantallaCargando(),
      error: (error, _) => _PantallaError(
        error: error,
        onReintentar: () => ref.invalidate(suscripcionProvider),
      ),
      data: (resumen) {
        final pendientes = resumen.pendientes;
        if (pendientes.isEmpty) {
          return shell;
        }
        return _PantallaPendientes(
          pendientes: pendientes,
          onAceptar: (doc) => _aceptarDocumento(ref, doc, context),
          onReintentar: () => ref.invalidate(suscripcionProvider),
        );
      },
    );
  }

  Future<void> _aceptarDocumento(
    WidgetRef ref,
    DocumentoPendiente doc,
    BuildContext context,
  ) async {
    final mensajero = ScaffoldMessenger.of(context);
    try {
      await ref.read(suscripcionServiceProvider).aceptarContrato(
            documentoId: doc.documentoId,
            version: doc.version,
            hash: doc.hash,
          );
      if (!context.mounted) return;
      mensajero.showSnackBar(
        SnackBar(
          content: Text(
            'Aceptaste ${doc.titulo ?? doc.documentoId} v${doc.version}.',
          ),
        ),
      );
      // Invalidar para re-evaluar el gate: si quedan pendientes, sigue
      // bloqueado; si no, pasa al shell.
      ref.invalidate(suscripcionProvider);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      mensajero.showSnackBar(SnackBar(content: Text(error.message)));
      // 409 version_obsoleta / hash_mismatch: refrescar para ver la
      // pendiente vigente.
      if (error is ConflictException) ref.invalidate(suscripcionProvider);
    }
  }
}

class _PantallaCargando extends StatelessWidget {
  const _PantallaCargando();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

class _PantallaError extends StatelessWidget {
  const _PantallaError({required this.error, required this.onReintentar});

  final Object error;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    final mensaje = error is NotFoundException
        ? 'La suscripción no está disponible todavía.'
        : 'Error al cargar la suscripción.';
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(mensaje, key: const Key('legal_gate_error')),
            const SizedBox(height: 16),
            FilledButton.tonal(
              key: const Key('legal_gate_reintentar'),
              onPressed: onReintentar,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PantallaPendientes extends StatelessWidget {
  const _PantallaPendientes({
    required this.pendientes,
    required this.onAceptar,
    required this.onReintentar,
  });

  final List<DocumentoPendiente> pendientes;
  final void Function(DocumentoPendiente doc) onAceptar;
  final VoidCallback onReintentar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 24),
                Icon(
                  Icons.gavel_outlined,
                  size: 48,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Documentos pendientes',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Para continuar usando la app debés aceptar los siguientes '
                  'documentos legales.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 24),
                for (final doc in pendientes) ...[
                  _TarjetaPendiente(
                    documento: doc,
                    onAceptar: () => onAceptar(doc),
                  ),
                  const SizedBox(height: 12),
                ],
                const SizedBox(height: 16),
                Center(
                  child: TextButton.icon(
                    key: const Key('legal_gate_refrescar'),
                    onPressed: onReintentar,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Actualizar'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TarjetaPendiente extends StatelessWidget {
  const _TarjetaPendiente({
    required this.documento,
    required this.onAceptar,
  });

  final DocumentoPendiente documento;
  final VoidCallback onAceptar;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final titulo = documento.titulo ?? documento.documentoId;
    return Card(
      key: Key('legal_pendiente_${documento.documentoId}'),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  Icons.description_outlined,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titulo,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Versión ${documento.version}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              key: Key('legal_aceptar_${documento.documentoId}'),
              onPressed: documento.aceptable ? onAceptar : null,
              child: const Text('Aceptar y continuar'),
            ),
          ],
        ),
      ),
    );
  }
}
