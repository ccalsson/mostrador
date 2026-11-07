import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/carrito/carrito_controller.dart';
import '../../models/staff_session.dart';
import '../../services/auth_service.dart';
import '../../services/catalogo_service.dart';
import '../../services/sucursales_service.dart';
import '../errors/api_exceptions.dart';
import '../network/api_client.dart';
import 'session_boundary.dart';
import 'token_store.dart';

enum AuthStatus { checking, unauthenticated, authenticated }

class AuthState {
  const AuthState._(this.status, this.sesion);

  const AuthState.checking() : this._(AuthStatus.checking, null);
  const AuthState.unauthenticated() : this._(AuthStatus.unauthenticated, null);
  const AuthState.authenticated(StaffSession sesion)
    : this._(AuthStatus.authenticated, sesion);

  final AuthStatus status;
  final StaffSession? sesion;
}

class AuthController extends Notifier<AuthState> {
  late final TokenStore _store;
  bool _transitioning = false;

  /// Siempre el cliente vigente: cada reinicio invalida `apiClientProvider`
  /// para descartar el `http.Client` cerrado y el tenant enlazado.
  ApiClient get _client => ref.read(apiClientProvider);

  /// Servicio de auth fresco: se reconstruye cuando `apiClientProvider` se
  /// invalida, así que no puede cachearse en `build()`.
  AuthService get _auth => ref.read(authServiceProvider);

  @override
  AuthState build() {
    _store = ref.read(tokenStoreProvider);
    Future.microtask(_bootstrap);
    return const AuthState.checking();
  }

  Future<void> login({required String email, required String password}) async {
    final token = await _auth.signIn(email: email, password: password);
    if (!ref.mounted) return;
    await _store.write(token);
    if (!ref.mounted) return;
    final sesion = await _auth.session();
    _nuevaSesion(sesion);
  }

  Future<void> logout() async {
    if (_transitioning) return;
    _transitioning = true;
    state = const AuthState.checking();
    try {
      await _auth.signOut();
    } on ApiException {
      // El cierre local no depende de que responda el servidor.
    }
    await _store.clear();
    _reiniciar('Sesión cerrada.', salir: true);
  }

  Future<void> cambiarSucursal(String id) async {
    final sesion = state.sesion;
    if (_transitioning || sesion == null) throw ContextChangedException();
    if (!sesion.staff.puedeCambiar) throw ForbiddenException();
    if (!sesion.contextoProtegido) {
      throw ValidationException(
        'El servidor necesita actualizarse antes de cambiar de sucursal.',
      );
    }
    final sucursales = ref.read(sucursalesServiceProvider);
    _transitioning = true;
    state = const AuthState.checking();
    var mensaje =
        'No se pudo confirmar el cambio. Revisá la sucursal activa antes de volver a operar.';
    var salir = false;
    try {
      await sucursales.usar(id);
      mensaje = 'Cambio de sucursal confirmado.';
    } on UnauthorizedException {
      await _store.clear();
      mensaje = 'La sesión expiró. Volvé a ingresar.';
      salir = true;
    } on NetworkException {
      mensaje = 'No se pudo confirmar el cambio. Revisá la sucursal activa antes de volver a operar.';
    } on ApiException catch (error) {
      mensaje = error.message;
    } finally {
      _reiniciar(mensaje, salir: salir);
    }
  }

  Future<void> _bootstrap() async {
    final token = await _store.read();
    if (!ref.mounted) return;
    if (token == null) {
      state = const AuthState.unauthenticated();
      return;
    }
    try {
      final sesion = await _auth.session();
      _nuevaSesion(sesion);
    } on UnauthorizedException {
      if (!ref.mounted) return;
      await _store.clear();
      if (!ref.mounted) return;
      state = const AuthState.unauthenticated();
    } on ApiException {
      if (!ref.mounted) return;
      state = const AuthState.unauthenticated();
    }
  }

  void _nuevaSesion(StaffSession sesion) {
    if (!ref.mounted) return;
    final client = _client;
    client.bindTenant(sesion.tenantId);
    client.onUnauthorized = _sesionRechazada;
    client.onContextChanged = () => _reiniciar(
      'La sucursal cambió en otra sesión. Revisá la sucursal activa antes de continuar.',
      salir: false,
    );
    ref.invalidate(catalogoProvider);
    state = AuthState.authenticated(sesion);
  }

  /// Reinicio en el mismo container. Todos los servicios hacen
  /// `ref.watch(apiClientProvider)` y los datos `ref.watch(servicio)`, así que
  /// invalidar el cliente arrastra al grafo entero y no queda estado del
  /// tenant anterior. Reemplazar el `ProviderScope` anidado no servía: el
  /// scope nuevo heredaba el container viejo y la sesión quedaba en
  /// `checking` para siempre.
  void _reiniciar(String mensaje, {required bool salir}) {
    if (!ref.mounted) return;
    _transitioning = false;
    ref.invalidate(apiClientProvider);
    ref.invalidate(carritoControllerProvider);
    state = salir
        ? const AuthState.unauthenticated()
        : const AuthState.checking();
    ref.read(sessionResetProvider.notifier).solicitar(mensaje);
    if (!salir) Future.microtask(_bootstrap);
  }

  void _sesionRechazada() async {
    if (!ref.mounted || _transitioning) return;
    _transitioning = true;
    state = const AuthState.checking();
    await _store.clear();
    _reiniciar('La sesión expiró. Volvé a ingresar.', salir: true);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
