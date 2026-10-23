import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/auth/auth_controller.dart';
import 'core/auth/session_boundary.dart';
import 'core/tema.dart';
import 'core/routing/app_router.dart';
import 'features/auth/session_screen.dart';
import 'services/offline_queue_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
      child: const SessionBoundary(child: MostradorApp()),
    ),
  );
}

class MostradorApp extends ConsumerStatefulWidget {
  const MostradorApp({super.key});

  @override
  ConsumerState<MostradorApp> createState() => _MostradorAppState();
}

class _MostradorAppState extends ConsumerState<MostradorApp> {
  String? _aviso;

  @override
  void initState() {
    super.initState();
    _aviso = ref.read(sessionNoticeProvider);
    Future.microtask(() {
      if (mounted) ref.read(temaControllerProvider.notifier).cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final modo = ref.watch(temaControllerProvider);
    final auth = ref.watch(authControllerProvider);
    return MaterialApp.router(
      title: 'Mostrador',
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      themeMode: modo,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => Column(
        children: [
          if (_aviso != null && auth.status != AuthStatus.checking)
            MaterialBanner(
              content: Text(_aviso!),
              actions: [
                TextButton(
                  onPressed: () => setState(() => _aviso = null),
                  child: const Text('Entendido'),
                ),
              ],
            ),
          Expanded(
            child: auth.status == AuthStatus.checking
                ? const SessionScreen()
                : child!,
          ),
        ],
      ),
    );
  }
}
