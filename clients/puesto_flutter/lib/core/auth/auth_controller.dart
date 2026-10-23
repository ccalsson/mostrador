import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  late final AuthService _auth;
  late final ApiClient _client;
  bool _transitioning = false;

  @override
  AuthState build() {
    _store = ref.read(tokenStoreProvider);
    _auth = ref.read(authServiceProvider);
    _client = ref.read(apiClientProvider);
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
    _reiniciar('Sesión cerrada.');
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
    try {
      await sucursales.usar(id);
      mensaje = 'Cambio de sucursal confirmado.';
    } on UnauthorizedException {
      await _store.clear();
      mensaje = 'La sesión expiró. Volvé a ingresar.';
    } on NetworkException {
      mensaje = 'No se pudo confirmar el cambio. Revisá la sucursal activa antes de volver a operar.';
    } on ApiException catch (error) {
      mensaje = error.message;
    } finally {
      _reiniciar(mensaje);
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
    _client.bindTenant(sesion.tenantId);
    _client.onUnauthorized = _sesionRechazada;
    _client.onContextChanged = () => _reiniciar(
      'La sucursal cambió en otra sesión. Revisá la sucursal activa antes de continuar.',
    );
    ref.invalidate(catalogoProvider);
    state = AuthState.authenticated(sesion);
  }

  void _reiniciar(String mensaje) {
    if (!ref.mounted) return;
    _client.close();
    state = const AuthState.checking();
    ref.read(sessionResetProvider.notifier).solicitar(mensaje);
  }

  void _sesionRechazada() async {
    if (!ref.mounted || _transitioning) return;
    _transitioning = true;
    _client.close();
    state = const AuthState.checking();
    await _store.clear();
    _reiniciar('La sesión expiró. Volvé a ingresar.');
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
