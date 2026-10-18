import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'market_api.dart';
import 'tema.dart';
import 'widgets/public_links.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    required this.api,
    required this.onAuthenticated,
    required this.onRetry,
    this.startupError,
    this.onAlternarTema,
    this.temaOscuro = false,
    this.registrationBaseUrl = apiBaseUrl,
    this.linkLauncher = launchUrl,
    super.key,
  });

  final MercadoApi api;
  final ValueChanged<Map<String, dynamic>> onAuthenticated;
  final VoidCallback onRetry;
  final String? startupError;
  final VoidCallback? onAlternarTema;
  final bool temaOscuro;
  final String registrationBaseUrl;
  final ExternalUrlLauncher linkLauncher;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String _profile = 'comprador';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _register() => openExternalPage(
    context,
    marketRegistrationUri(
      profile: _profile,
      baseUrl: widget.registrationBaseUrl,
    ),
    configuration: 'API_BASE_URL',
    launcher: widget.linkLauncher,
  );

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final actor = await widget.api.signIn(
        email: _email.text.trim(),
        password: _password.text,
        profile: _profile,
      );
      if (mounted) widget.onAuthenticated(actor);
    } on MercadoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final url = await widget.api.startGoogle(_profile);
      final launched = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!launched) throw const MercadoApiException('No se pudo abrir Google en el navegador.');
    } on MercadoApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = context.tokens;
    final oscuro = theme.brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 448),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: IconButton(
                        tooltip: 'Cambiar tema',
                        onPressed: widget.onAlternarTema,
                        icon: Icon(oscuro ? Icons.light_mode : Icons.dark_mode),
                      ),
                    ),
                    Center(
                      child: Container(
                        width: 64,
                        height: 64,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: tokens.leaf,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          'M',
                          style: theme.textTheme.displaySmall?.copyWith(
                            color: tokens.leafFg,
                            fontSize: 34,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Mercado al Toque',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.displaySmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Comprá a los puestos o trabajá como cargador.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(color: tokens.inkSoft),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: _BotonPerfil(
                            etiqueta: 'Comprador',
                            icono: Icons.shopping_basket_outlined,
                            iconoActivo: Icons.shopping_basket,
                            seleccionado: _profile == 'comprador',
                            onTap: _busy
                                ? null
                                : () => setState(() => _profile = 'comprador'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _BotonPerfil(
                            etiqueta: 'Cargador',
                            icono: Icons.route_outlined,
                            iconoActivo: Icons.route,
                            seleccionado: _profile == 'cargador',
                            onTap: _busy
                                ? null
                                : () => setState(() => _profile = 'cargador'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Correo electrónico'),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        return text.contains('@') ? null : 'Ingresá un correo válido.';
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Contraseña'),
                      validator: (value) =>
                          (value?.length ?? 0) >= 8 ? null : 'Usá al menos 8 caracteres.',
                    ),
                    if (widget.startupError != null) ...[
                      const SizedBox(height: 12),
                      Text(widget.startupError!,
                          style: TextStyle(color: theme.colorScheme.error)),
                      TextButton(onPressed: widget.onRetry, child: const Text('Reintentar conexión')),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 48,
                      child: FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Ingresar'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _google,
                        icon: const Icon(Icons.account_circle_outlined),
                        label: const Text('Continuar con Google'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 48,
                      child: OutlinedButton(
                        onPressed: _busy ? null : _register,
                        child: const Text('Crear una cuenta nueva'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'El registro se abre en el navegador. Tras confirmar tu correo, volvé aquí para ingresar.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(color: tokens.inkSoft),
                    ),
                    const SizedBox(height: 16),
                    PublicLinks(launcher: widget.linkLauncher),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BotonPerfil extends StatelessWidget {
  const _BotonPerfil({
    required this.etiqueta,
    required this.icono,
    required this.iconoActivo,
    required this.seleccionado,
    required this.onTap,
  });

  final String etiqueta;
  final IconData icono;
  final IconData iconoActivo;
  final bool seleccionado;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colorTexto = seleccionado ? tokens.leafFg : tokens.inkSoft;
    return Material(
      color: seleccionado ? tokens.terra : tokens.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: seleccionado ? tokens.terra : tokens.line),
      ),
      child: InkWell(
        customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                seleccionado ? iconoActivo : icono,
                size: 18,
                color: seleccionado ? tokens.leafFg : tokens.muted,
              ),
              const SizedBox(width: 8),
              Text(
                etiqueta,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600, color: colorTexto),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
