import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import 'login_screen.dart';
import 'market_api.dart';
import 'market_home.dart';
import 'tema.dart';

void main() => runApp(const MercadoAlToqueApp());

class MercadoAlToqueApp extends StatefulWidget {
  const MercadoAlToqueApp({super.key});

  @override
  State<MercadoAlToqueApp> createState() => _MercadoAlToqueAppState();
}

class _MercadoAlToqueAppState extends State<MercadoAlToqueApp> {
  late final MercadoApi _api;
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSubscription;
  Map<String, dynamic>? _actor;
  bool _loading = true;
  String? _startupError;
  ThemeMode _tema = ThemeMode.light;

  @override
  void initState() {
    super.initState();
    _api = MercadoApi();
    _api.onUnauthorized = () {
      if (mounted) setState(() => _actor = null);
    };
    _appLinks = AppLinks();
    _linkSubscription = _appLinks.uriLinkStream.listen(
      _handleLink,
      onError: (Object error) {
        if (mounted) {
          setState(() => _startupError = 'No se pudo completar el acceso con Google.');
        }
      },
    );
    unawaited(_restoreSession());
    unawaited(_restoreInitialLink());
    unawaited(_cargarTema());
  }

  Future<void> _cargarTema() async {
    final guardado = await TemaStore().leer();
    if (guardado != null && mounted) setState(() => _tema = guardado);
  }

  Future<void> _alternarTema() async {
    final nuevo = _tema == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    setState(() => _tema = nuevo);
    await TemaStore().guardar(nuevo);
  }

  Future<void> _restoreInitialLink() async {
    final uri = await _appLinks.getInitialLink();
    if (uri != null) {
      await _handleLink(uri);
    }
  }

  Future<void> _handleLink(Uri uri) async {
    if (uri.scheme != 'mercadoaltoque' || uri.host != 'auth') return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) {
      if (mounted) {
        setState(() => _startupError = 'Google no devolvió una sesión válida.');
      }
      return;
    }
    await _api.acceptGoogleToken(token);
    await _restoreSession();
  }

  Future<void> _restoreSession() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _startupError = null;
      });
    }
    try {
      final token = await _api.readToken();
      if (token == null) {
        if (mounted) {
          setState(() {
            _actor = null;
            _loading = false;
          });
        }
        return;
      }
      final actor = await _api.me();
      if (mounted) {
        setState(() {
          _actor = actor;
          _loading = false;
        });
      }
    } on MercadoApiException catch (error) {
      if (mounted) {
        setState(() {
          _actor = null;
          _startupError = error.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    try {
      await _api.signOut();
      if (mounted) {
        setState(() => _actor = null);
      }
    } on MercadoApiException catch (error) {
      if (mounted) {
        setState(() {
          _actor = null;
          _startupError = error.message;
        });
      }
    }
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    _api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mercado al Toque',
      debugShowCheckedModeBanner: false,
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      themeMode: _tema,
      home: _loading
          ? const _LoadingScreen()
          : _actor == null
              ? LoginScreen(
                  api: _api,
                  startupError: _startupError,
                  onAuthenticated: (actor) => setState(() => _actor = actor),
                  onRetry: _restoreSession,
                  onAlternarTema: _alternarTema,
                  temaOscuro: _tema == ThemeMode.dark,
                )
              : MarketHome(
                  api: _api,
                  actor: _actor!,
                  onSignOut: _logout,
                  onRefreshActor: _restoreSession,
                  onAlternarTema: _alternarTema,
                  temaOscuro: _tema == ThemeMode.dark,
                ),
    );
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
}
