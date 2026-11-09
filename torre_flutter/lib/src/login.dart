import 'package:flutter/material.dart';

import 'sesion.dart';
import 'tema.dart';
import 'widgets.dart';

class LoginTorre extends StatefulWidget {
  const LoginTorre({super.key});

  @override
  State<LoginTorre> createState() => _LoginTorreState();
}

class _LoginTorreState extends State<LoginTorre> {
  final _servidor = TextEditingController();
  final _email = TextEditingController();
  final _clave = TextEditingController();
  bool _sembrado = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_sembrado) return;
    _sembrado = true;
    final sesion = SesionScope.of(context);
    _servidor.text = sesion.api.servidor;
    _email.text = sesion.api.email;
  }

  @override
  void dispose() {
    _servidor.dispose();
    _email.dispose();
    _clave.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sesion = SesionScope.of(context);
    final c = torreColorsOf(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Torre de Control', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'serif', fontSize: 30, color: c.ink)),
                  const SizedBox(height: 6),
                  Text(
                    'Consola interna. Entrá con el correo que ya abre la Torre en la web.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.muted, fontSize: 14),
                  ),
                  const SizedBox(height: 22),
                  Container(
                    decoration: BoxDecoration(
                      color: c.surface,
                      border: Border.all(color: c.line),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      children: [
                        Container(height: 4, decoration: BoxDecoration(color: c.leaf, borderRadius: const BorderRadius.vertical(top: Radius.circular(20)))),
                        Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Campo(controller: _servidor, label: 'Servidor', teclado: TextInputType.url, ayuda: 'La web publicada, sin barra al final.'),
                              const SizedBox(height: 12),
                              Campo(controller: _email, label: 'Correo', teclado: TextInputType.emailAddress),
                              const SizedBox(height: 12),
                              Campo(controller: _clave, label: 'Clave', clave: true),
                              const SizedBox(height: 18),
                              BotonPrimario('Entrar', _entrar, ocupado: sesion.entrando),
                              if (sesion.error != null) ...[
                                const SizedBox(height: 12),
                                Text(sesion.error!, style: TextStyle(color: c.terra, fontSize: 14)),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _entrar() async {
    try {
      await SesionScope.of(context).entrar(_servidor.text, _email.text, _clave.text);
      _clave.clear();
    } catch (_) {
      // El mensaje ya queda en sesion.error y se muestra bajo el botón.
    }
  }
}
