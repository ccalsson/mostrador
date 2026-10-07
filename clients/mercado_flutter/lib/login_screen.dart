import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'market_api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    required this.api,
    required this.onAuthenticated,
    required this.onRetry,
    this.startupError,
    super.key,
  });

  final MercadoApi api;
  final ValueChanged<Map<String, dynamic>> onAuthenticated;
  final VoidCallback onRetry;
  final String? startupError;

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
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.shopping_basket_outlined, size: 54),
                    const SizedBox(height: 12),
                    Text(
                      'Mercado al Toque',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Comprá a los puestos o trabajá como cargador.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'comprador', label: Text('Comprador')),
                        ButtonSegment(value: 'cargador', label: Text('Cargador')),
                      ],
                      selected: {_profile},
                      onSelectionChanged: _busy
                          ? null
                          : (selection) => setState(() => _profile = selection.first),
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
                      Text(widget.startupError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      TextButton(onPressed: widget.onRetry, child: const Text('Reintentar conexión')),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_registering ? 'Crear cuenta' : 'Ingresar'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _google,
                      icon: const Icon(Icons.account_circle_outlined),
                      label: const Text('Continuar con Google'),
                    ),
                    TextButton(
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
