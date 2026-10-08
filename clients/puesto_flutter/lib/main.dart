import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/tema.dart';
import 'core/routing/app_router.dart';

// Riverpod 3 reintenta providers fallidos con backoff exponencial (~45s);
// lo desactivamos: los errores se muestran honestos al instante y el
// refresco es el botón Reintentar.
Duration? _sinReintento(int _, Object _) => null;

void main() =>
    runApp(const ProviderScope(retry: _sinReintento, child: MostradorApp()));

class MostradorApp extends ConsumerStatefulWidget {
  const MostradorApp({super.key});

  @override
  ConsumerState<MostradorApp> createState() => _MostradorAppState();
}

class _MostradorAppState extends ConsumerState<MostradorApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(temaControllerProvider.notifier).cargar());
  }

  @override
  Widget build(BuildContext context) {
    final modo = ref.watch(temaControllerProvider);
    return MaterialApp.router(
      title: 'Mostrador',
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      themeMode: modo,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
