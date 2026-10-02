import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/staff_session.dart';
import '../../services/auth_service.dart';
import '../../services/catalogo_service.dart';
import '../errors/api_exceptions.dart';
import '../network/api_client.dart';
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

/// Sesión de la app: restaura el token guardado al arrancar, expone login y
/// logout, y cierra la sesión local si el servidor rechaza el token (401).
class AuthController extends Notifier<AuthState> {
  late final TokenStore _store;
  late final AuthService _auth;

  @override
  AuthState build() {
    _store = ref.read(tokenStoreProvider);
    _auth = ref.read(authServiceProvider);
    ref.read(apiClientProvider).onUnauthorized = _sesionRechazada;
    Future.microtask(_bootstrap);
    return const AuthState.checking();
  }

  Future<void> login({required String email, required String password}) async {
    final token = await _auth.signIn(email: email, password: password);
    await _store.write(token);
    final sesion = await _auth.session();
    _nuevaSesion(sesion);
  }

  Future<void> logout() async {
    try {
      await _auth.signOut();
    } on ApiException {
      // Best effort: la sesión local se cierra aunque el servidor no responda.
    }
    await _store.clear();
    if (!ref.mounted) return;
    ref.invalidate(catalogoProvider);
    state = const AuthState.unauthenticated();
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
      if (!ref.mounted) return;
      _nuevaSesion(sesion);
    } on UnauthorizedException {
      await _store.clear();
      if (!ref.mounted) return;
      state = const AuthState.unauthenticated();
    } on ApiException {
      // Servidor inalcanzable: se conserva el token y se pide login; la
      // próxima apertura reintenta el bootstrap.
      state = const AuthState.unauthenticated();
    }
  }

  void _nuevaSesion(StaffSession sesion) {
    if (!ref.mounted) return;
    ref.invalidate(catalogoProvider);
    state = AuthState.authenticated(sesion);
  }

  /// Hook del [ApiClient]: el servidor rechazó una request con token (401).
  void _sesionRechazada() {
    if (!ref.mounted) return;
    _store.clear();
    ref.invalidate(catalogoProvider);
    state = const AuthState.unauthenticated();
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
