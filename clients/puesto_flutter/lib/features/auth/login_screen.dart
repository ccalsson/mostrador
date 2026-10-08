import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exceptions.dart';
import '../../core/tema.dart';
import '../../services/tenant_service.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _ingresar() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Ingresá correo y contraseña.');
      return;
    }
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .login(email: email, password: password);
    } on UnauthorizedException {
      _mostrarError('Correo o contraseña incorrectos.');
    } on ApiException catch (e) {
      _mostrarError(e.message);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _mostrarError(String mensaje) {
    if (mounted) setState(() => _error = mensaje);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = context.tokens;
    final tenant = ref.watch(tenantProvider).value;
    final oscuro = theme.brightness == Brightness.dark;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(
                    key: const Key('btn_tema'),
                    tooltip: 'Cambiar tema',
                    onPressed: () =>
                        ref.read(temaControllerProvider.notifier).alternar(),
                    icon: Icon(oscuro ? Icons.light_mode : Icons.dark_mode),
                  ),
                ),
                Text(
                  tenant?.nombre ?? 'Mostrador',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineLarge,
                ),
                if (tenant != null && tenant.bajada.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    tenant.bajada,
                    textAlign: TextAlign.center,
                    style:
                        theme.textTheme.bodyMedium?.copyWith(color: tokens.inkSoft),
                  ),
                ],
                const SizedBox(height: 32),
                TextField(
                  key: const Key('login_email'),
                  controller: _email,
                  enabled: !_enviando,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Correo',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('login_password'),
                  controller: _password,
                  enabled: !_enviando,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Contraseña',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _ingresar(),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  key: const Key('login_submit'),
                  onPressed: _enviando ? null : _ingresar,
                  child: _enviando
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Ingresar'),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    key: const Key('login_error'),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
