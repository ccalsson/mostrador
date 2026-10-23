import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/admin/adaptive_shell.dart';

void main() => runApp(const ProviderScope(child: MostradorApp()));

class MostradorApp extends StatelessWidget {
  const MostradorApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Mostrador',
        theme: ThemeData(
          colorSchemeSeed: const Color(0xFF1B5E3B),
          useMaterial3: true,
          brightness: Brightness.light,
        ),
        darkTheme: ThemeData(
          colorSchemeSeed: const Color(0xFF1B5E3B),
          useMaterial3: true,
          brightness: Brightness.dark,
        ),
        home: const AdaptiveShell(),
      );
}
