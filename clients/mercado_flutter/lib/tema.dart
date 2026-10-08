import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tokens del contrato visual (app/src/styles.css), en claro y oscuro.
class TokensMostrador extends ThemeExtension<TokensMostrador> {
  const TokensMostrador({
    required this.paper,
    required this.paper2,
    required this.surface,
    required this.ink,
    required this.inkSoft,
    required this.muted,
    required this.line,
    required this.leaf,
    required this.leaf2,
    required this.leafFg,
    required this.terra,
    required this.ok,
    required this.warnBg,
    required this.okBg,
    required this.naranja,
    required this.ambar,
    required this.alerta,
  });

  final Color paper;
  final Color paper2;
  final Color surface;
  final Color ink;
  final Color inkSoft;
  final Color muted;
  final Color line;
  final Color leaf;
  final Color leaf2;
  final Color leafFg;
  final Color terra;
  final Color ok;
  final Color warnBg;
  final Color okBg;
  final Color naranja;
  final Color ambar;
  final Color alerta;

  static const claro = TokensMostrador(
    paper: Color(0xFFF3EDE1),
    paper2: Color(0xFFE7DDCC),
    surface: Color(0xFFFFFAF2),
    ink: Color(0xFF1A1612),
    inkSoft: Color(0xFF3D352C),
    muted: Color(0xFF6D6559),
    line: Color(0xFFD6CCBB),
    leaf: Color(0xFF1B5E3B),
    leaf2: Color(0xFF0F3D26),
    leafFg: Color(0xFFF4EFE4),
    terra: Color(0xFFB5471A),
    ok: Color(0xFF2C6B45),
    warnBg: Color(0xFFF4E1D4),
    okBg: Color(0xFFDCE8E0),
    naranja: Color(0xFFC46B14),
    ambar: Color(0xFFC9A227),
    alerta: Color(0xFF9B2330),
  );

  static const oscuro = TokensMostrador(
    paper: Color(0xFF14110E),
    paper2: Color(0xFF241E18),
    surface: Color(0xFF1C1814),
    ink: Color(0xFFF3EDE1),
    inkSoft: Color(0xFFDDD2C3),
    muted: Color(0xFFB3A394),
    line: Color(0xFF3D342C),
    leaf: Color(0xFF3FA36E),
    leaf2: Color(0xFF0E3324),
    leafFg: Color(0xFFF4EFE4),
    terra: Color(0xFFE17A45),
    ok: Color(0xFF8FD4AE),
    warnBg: Color(0xFF3A261E),
    okBg: Color(0xFF1A3328),
    naranja: Color(0xFFE39245),
    ambar: Color(0xFFE3C56A),
    alerta: Color(0xFFE07078),
  );

  @override
  TokensMostrador copyWith() => this;

  @override
  TokensMostrador lerp(TokensMostrador? other, double t) =>
      t < 0.5 ? this : (other ?? this);
}

extension TokensContexto on BuildContext {
  TokensMostrador get tokens => Theme.of(this).extension<TokensMostrador>()!;
}

const _plex = TextStyle(fontFamily: 'IBM Plex Sans', height: 1.25);
const _fraunces = TextStyle(fontFamily: 'Fraunces', fontWeight: FontWeight.w600);

ThemeData _tema(TokensMostrador t, Brightness brillo) {
  final oscuro = brillo == Brightness.dark;
  final colorTitulo = oscuro ? t.leaf : t.leaf2;
  final texto = TextTheme(
    displayLarge: _fraunces.copyWith(fontSize: 40, color: colorTitulo),
    displayMedium: _fraunces.copyWith(fontSize: 34, color: colorTitulo),
    displaySmall: _fraunces.copyWith(fontSize: 30, color: colorTitulo),
    headlineLarge: _fraunces.copyWith(fontSize: 28, color: colorTitulo),
    headlineMedium: _fraunces.copyWith(fontSize: 24, color: colorTitulo),
    headlineSmall: _fraunces.copyWith(fontSize: 21, color: colorTitulo),
    titleLarge: _fraunces.copyWith(fontSize: 19, color: t.ink),
    titleMedium: _plex.copyWith(fontSize: 16, fontWeight: FontWeight.w600, color: t.ink),
    titleSmall: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: t.ink),
    bodyLarge: _plex.copyWith(fontSize: 16, color: t.ink),
    bodyMedium: _plex.copyWith(fontSize: 14, color: t.ink),
    bodySmall: _plex.copyWith(fontSize: 12, color: t.inkSoft),
    labelLarge: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: t.ink),
    labelMedium: _plex.copyWith(
        fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.6, color: t.muted),
    labelSmall: _plex.copyWith(
        fontSize: 10, fontWeight: FontWeight.w500, letterSpacing: 0.4, color: t.muted),
  );

  OutlineInputBorder borde(Color color, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: color, width: w),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: brillo,
    colorScheme: ColorScheme(
      brightness: brillo,
      primary: t.leaf,
      onPrimary: t.leafFg,
      primaryContainer: t.okBg,
      onPrimaryContainer: oscuro ? t.ok : t.leaf2,
      secondary: t.naranja,
      onSecondary: oscuro ? t.paper : Colors.white,
      secondaryContainer: t.warnBg,
      onSecondaryContainer: oscuro ? t.terra : t.alerta,
      tertiary: t.ambar,
      onTertiary: t.ink,
      tertiaryContainer: t.paper2,
      onTertiaryContainer: t.ink,
      error: t.terra,
      onError: oscuro ? t.paper : Colors.white,
      errorContainer: t.warnBg,
      onErrorContainer: oscuro ? t.terra : t.alerta,
      surface: t.surface,
      onSurface: t.ink,
      onSurfaceVariant: t.muted,
      outline: t.line,
      outlineVariant: t.line,
      inverseSurface: oscuro ? t.leafFg : t.leaf2,
      onInverseSurface: oscuro ? t.leaf2 : t.leafFg,
      surfaceContainerHighest: t.paper2,
      surfaceContainer: t.surface,
      surfaceContainerLow: t.surface,
      surfaceContainerLowest: t.surface,
      surfaceTint: Colors.transparent,
      shadow: Colors.transparent,
      scrim: Colors.black54,
    ),
    scaffoldBackgroundColor: t.paper,
    extensions: [t],
    textTheme: texto,
    appBarTheme: AppBarTheme(
      backgroundColor: t.leaf2,
      foregroundColor: t.leafFg,
      elevation: 0,
      titleTextStyle: _fraunces.copyWith(fontSize: 18, color: t.leafFg),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surface,
      hintStyle: _plex.copyWith(color: t.muted),
      labelStyle: _plex.copyWith(color: t.inkSoft),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: borde(t.line),
      enabledBorder: borde(t.line),
      focusedBorder: borde(t.leaf, 1.5),
      errorBorder: borde(t.terra),
      focusedErrorBorder: borde(t.terra, 1.5),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: t.leaf,
        foregroundColor: t.leafFg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        textStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.ink,
        side: BorderSide(color: t.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        textStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: t.leaf,
        textStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      titleTextStyle: _fraunces.copyWith(fontSize: 20, color: t.ink),
      contentTextStyle: _plex.copyWith(fontSize: 14, color: t.inkSoft),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: oscuro ? t.leafFg : t.leaf2,
      contentTextStyle: _plex.copyWith(fontSize: 14, color: t.leaf2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: DividerThemeData(color: t.line, thickness: 1, space: 1),
    chipTheme: ChipThemeData(
      backgroundColor: t.surface,
      side: BorderSide(color: t.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelStyle: _plex.copyWith(fontSize: 12, fontWeight: FontWeight.w500, color: t.ink),
    ),
    cardTheme: CardThemeData(
      color: t.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: t.line),
      ),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: t.muted,
      titleTextStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w500, color: t.ink),
      subtitleTextStyle: _plex.copyWith(fontSize: 12, color: t.muted),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: t.leaf, linearTrackColor: t.line),
    tabBarTheme: TabBarThemeData(
      labelColor: t.leaf,
      unselectedLabelColor: t.muted,
      indicatorColor: t.leaf,
      dividerColor: t.line,
      labelStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      unselectedLabelStyle: _plex.copyWith(fontSize: 14, fontWeight: FontWeight.w500),
    ),
  );
}

ThemeData temaClaro() => _tema(TokensMostrador.claro, Brightness.light);

ThemeData temaOscuro() => _tema(TokensMostrador.oscuro, Brightness.dark);

/// Preferencia de tema persistida (Keystore en Android).
class TemaStore {
  TemaStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'mostrador-tema';

  final FlutterSecureStorage _storage;

  Future<ThemeMode?> leer() async {
    final v = await _storage.read(key: _key);
    if (v == 'oscuro') return ThemeMode.dark;
    if (v == 'claro') return ThemeMode.light;
    return null;
  }

  Future<void> guardar(ThemeMode modo) =>
      _storage.write(key: _key, value: modo == ThemeMode.dark ? 'oscuro' : 'claro');
}
