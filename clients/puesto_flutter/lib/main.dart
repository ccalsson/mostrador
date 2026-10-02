import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routing/app_router.dart';

void main() => runApp(const ProviderScope(child: MostradorApp()));

class MostradorApp extends ConsumerWidget {
  const MostradorApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Mostrador',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xff1f6039),
        useMaterial3: true,
      ),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
