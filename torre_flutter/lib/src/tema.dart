import 'package:flutter/material.dart';

class TorreColors {
  const TorreColors({
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
    required this.okBg,
    required this.warnBg,
    required this.ambar,
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
  final Color okBg;
  final Color warnBg;
  final Color ambar;

  static const claro = TorreColors(
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
    okBg: Color(0xFFDCE8E0),
    warnBg: Color(0xFFF4E1D4),
    ambar: Color(0xFFC9A227),
  );

  static const oscuro = TorreColors(
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
    okBg: Color(0xFF1A3328),
    warnBg: Color(0xFF3A261E),
    ambar: Color(0xFFE3C56A),
  );

  static const panel = Color(0xFF14110E);
  static const panelTexto = Color(0xFFF4EFE4);
}

TorreColors torreColorsOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? TorreColors.oscuro : TorreColors.claro;

ThemeData torreTema(Brightness brightness) {
  final c = brightness == Brightness.dark ? TorreColors.oscuro : TorreColors.claro;
  final base = ThemeData(brightness: brightness, useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: c.paper,
    colorScheme: ColorScheme.fromSeed(
      seedColor: c.leaf,
      brightness: brightness,
      primary: c.leaf,
      onPrimary: c.leafFg,
      surface: c.surface,
      onSurface: c.ink,
      error: c.terra,
    ),
    textTheme: base.textTheme.apply(bodyColor: c.ink, displayColor: c.ink),
    appBarTheme: AppBarTheme(
      backgroundColor: TorreColors.panel,
      foregroundColor: TorreColors.panelTexto,
      elevation: 0,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.leaf, width: 1.6)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    ),
    snackBarTheme: SnackBarThemeData(backgroundColor: c.ink, contentTextStyle: TextStyle(color: c.paper)),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
  );
}
