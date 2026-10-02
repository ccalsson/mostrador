import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/app_config.dart';
import '../core/network/api_client.dart';
import '../models/staff_session.dart';

/// Habla con Better Auth (`/api/auth/*`) y con `GET /api/v1/session`.
///
/// El cliente Dart no envía `Origin` por sí solo y Better Auth lo exige en
/// sign-in/sign-out, por eso se adjunta [AppConfig.authOrigin].
class AuthService {
  AuthService(this._client);

  final ApiClient _client;

  /// Devuelve el token de sesión (`{token, user}`).
  Future<String> signIn({required String email, required String password}) async {
    final data = await _client.post(
      '/api/auth/sign-in/email',
      body: {'email': email, 'password': password},
      extraHeaders: {'origin': AppConfig.authOrigin},
    );
    final token = (data as Map<String, dynamic>)['token'];
    if (token is! String || token.isEmpty) {
      throw const FormatException('Respuesta de login sin token.');
    }
    return token;
  }

  Future<void> signOut() => _client.post(
        '/api/auth/sign-out',
        body: const <String, Object?>{},
        extraHeaders: {'origin': AppConfig.authOrigin},
      );

  Future<StaffSession> session() async {
    final data = await _client.get('/api/v1/session');
    return StaffSession.fromJson(data as Map<String, dynamic>);
  }
}

final authServiceProvider =
    Provider<AuthService>((ref) => AuthService(ref.watch(apiClientProvider)));
