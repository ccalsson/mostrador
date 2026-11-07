import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

class SessionResetController extends Notifier<String?> {
  @override
  String? build() => null;

  void solicitar(String mensaje) => state = mensaje;
}

final sessionResetProvider = NotifierProvider<SessionResetController, String?>(
  SessionResetController.new,
);

final sessionNoticeProvider = Provider<String?>((ref) => null);

/// Publica el aviso del último reinicio de sesión sin recrear el
/// `ProviderScope`: el reinicio lo hace `AuthController` invalidando el
/// cliente, que arrastra a todos los servicios y datos.
class SessionBoundary extends StatefulWidget {
  const SessionBoundary({
    super.key,
    required this.child,
    this.overrides = const [],
  });

  final Widget child;
  final List<Override> overrides;

  @override
  State<SessionBoundary> createState() => _SessionBoundaryState();
}

class _SessionBoundaryState extends State<SessionBoundary> {
  String? _mensaje;

  void _avisar(String mensaje) => setState(() => _mensaje = mensaje);

  @override
  Widget build(BuildContext context) => ProviderScope(
    retry: (_, _) => null,
    overrides: [
      ...widget.overrides,
      sessionNoticeProvider.overrideWithValue(_mensaje),
    ],
    child: _ResetListener(onReset: _avisar, child: widget.child),
  );
}

class _ResetListener extends ConsumerWidget {
  const _ResetListener({required this.onReset, required this.child});

  final void Function(String) onReset;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionResetProvider, (_, mensaje) {
      if (mensaje != null) onReset(mensaje);
    });
    return child;
  }
}
