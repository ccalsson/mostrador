/// Configuración por entorno. Los valores llegan por `--dart-define`; nunca
/// se hardcodea una URL en features, servicios ni cliente HTTP.
///
/// DEV (backend `npm run dev` en `app/`):
///   Windows:          flutter run -d windows
///   Emulador Android: flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080
///
/// STAGING/PROD se agregan más adelante con los mismos defines.
abstract final class AppConfig {
  /// Base del backend (sin barra final). Default DEV: servidor local.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8080',
  );

  /// `Origin` que Better Auth valida contra sus trustedOrigins en
  /// sign-in/sign-out (el cliente Dart no lo manda solo).
  static const String authOrigin = String.fromEnvironment(
    'API_AUTH_ORIGIN',
    defaultValue: 'http://localhost:8080',
  );

  static const Duration requestTimeout = Duration(seconds: 15);
}
