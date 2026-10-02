import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/admin_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/session_screen.dart';
import '../../features/caja/caja_screen.dart';
import '../../features/vendedor/vendedor_screen.dart';
import '../../models/staff_session.dart';
import '../auth/auth_controller.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RefrescoPorSesion(ref);
  ref.onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: '/session',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final location = state.matchedLocation;
      return switch (auth.status) {
        AuthStatus.checking => location == '/session' ? null : '/session',
        AuthStatus.unauthenticated => location == '/login' ? null : '/login',
        AuthStatus.authenticated =>
          (location == '/login' || location == '/session')
              ? _rutaInicial(auth.sesion!.staff.rol)
              : null,
      };
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/session', builder: (context, state) => const SessionScreen()),
      GoRoute(path: '/vendedor', builder: (context, state) => const VendedorScreen()),
      GoRoute(path: '/caja', builder: (context, state) => const CajaScreen()),
      GoRoute(path: '/admin', builder: (context, state) => const AdminScreen()),
    ],
  );
});

String _rutaInicial(Rol rol) => switch (rol) {
      Rol.vendedor => '/vendedor',
      Rol.cajero => '/caja',
      Rol.admin => '/admin',
    };

/// Puente Riverpod → `refreshListenable` de go_router: re-evalúa el redirect
/// cada vez que cambia el estado de sesión.
class _RefrescoPorSesion extends ChangeNotifier {
  _RefrescoPorSesion(Ref ref) {
    _sub = ref.listen(authControllerProvider, (_, _) => notifyListeners());
  }

  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
