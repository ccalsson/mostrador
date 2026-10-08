import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'market_api.dart';
import 'tema.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    required this.api,
    required this.onAuthenticated,
    required this.onRetry,
    this.startupError,
    this.onAlternarTema,
    this.temaOscuro = false,
    super.key,
  });

  final MercadoApi api;
  final ValueChanged<Map<String, dynamic>> onAuthenticated;
  final VoidCallback onRetry;
  final String? startupError;
  final VoidCallback? onAlternarTema;
  final bool temaOscuro;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _documentNumber = TextEditingController();
  String _profile = 'comprador';
  String _country = 'AR';
  bool _registering = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _documentNumber.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final actor = _registering
          ? _profile == 'comprador'
              ? await widget.api.registerBuyer(
                  name: _name.text.trim(),
                  email: _email.text.trim(),
                  password: _password.text,
                  phone: _phone.text.trim(),
                  country: _country,
                  documentType: _country == 'AR' ? 'DNI' : 'CI_PY',
                  documentNumber: _documentNumber.text.trim(),
                )
              : await widget.api.registerCourier(
                  name: _name.text.trim(),
                  email: _email.text.trim(),
                  password: _password.text,
                  phone: _phone.text.trim(),
                )
          : await widget.api.signIn(
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
                    if (_registering) ...[
                      TextFormField(
                        controller: _name,
                        decoration: const InputDecoration(labelText: 'Nombre'),
                        validator: _required,
                      ),
                    ],
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
                    if (_registering) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Teléfono'),
                        validator: _required,
                      ),
                      if (_profile == 'comprador') ...[
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: _country,
                          decoration: const InputDecoration(labelText: 'País'),
                          items: const [
                            DropdownMenuItem(value: 'AR', child: Text('Argentina')),
                            DropdownMenuItem(value: 'PY', child: Text('Paraguay')),
                          ],
                          onChanged: (value) => setState(() => _country = value ?? 'AR'),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _documentNumber,
                          decoration: InputDecoration(
                            labelText: _country == 'AR' ? 'Número de DNI' : 'Número de CI',
                          ),
                          validator: _required,
                        ),
                      ],
                    ],
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
                            : Text(_registering ? 'Crear cuenta' : 'Ingresar'),
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
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _registering = !_registering;
                                  _error = null;
                                }),
                        child: Text(
                          _registering ? 'Ya tengo cuenta · Ingresar' : 'Crear una cuenta nueva',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String? _required(String? value) =>
      (value?.trim().isNotEmpty ?? false) ? null : 'Este campo es obligatorio.';
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
