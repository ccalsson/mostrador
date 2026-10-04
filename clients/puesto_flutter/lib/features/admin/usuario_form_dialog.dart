import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/staff_session.dart';
import '../../services/usuarios_service.dart';
import 'usuario_form_controller.dart';

/// Diálogo de alta de usuario (nombre, email, contraseña, rol).
Future<void> mostrarFormUsuario(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _UsuarioFormDialog(),
  );
}

class _UsuarioFormDialog extends ConsumerStatefulWidget {
  const _UsuarioFormDialog();

  @override
  ConsumerState<_UsuarioFormDialog> createState() => _UsuarioFormDialogState();
}

class _UsuarioFormDialogState extends ConsumerState<_UsuarioFormDialog> {
  late final TextEditingController _nombre;
  late final TextEditingController _email;
  late final TextEditingController _password;
  Rol _rol = Rol.vendedor;
  bool _verPassword = false;
  String? _validacion;

  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController();
    _email = TextEditingController();
    _password = TextEditingController();
    Future.microtask(() {
      if (mounted) ref.read(usuarioFormProvider.notifier).reiniciar();
    });
  }

  @override
  void dispose() {
    _nombre.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _crear() async {
    final nombre = _nombre.text.trim();
    final email = _email.text.trim();
    final password = _password.text;
    if (nombre.isEmpty) {
      return setState(() => _validacion = 'Ingresá el nombre.');
    }
    if (!email.contains('@') || email.length > 200) {
      return setState(() => _validacion = 'Email inválido.');
    }
    if (password.length < 6) {
      return setState(() => _validacion = 'La contraseña debe tener al menos 6 caracteres.');
    }
    setState(() => _validacion = null);
    final ok = await ref.read(usuarioFormProvider.notifier).crear(
          UsuarioInput(
            nombre: nombre,
            email: email,
            password: password,
            rol: _rol,
          ),
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final estado = ref.watch(usuarioFormProvider);
    final error = _validacion ?? estado.errorMensaje;

    return AlertDialog(
      title: const Text('Nuevo usuario'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                key: const Key('admin_usuario_nombre'),
                controller: _nombre,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nombre'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_usuario_email'),
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('admin_usuario_password'),
                controller: _password,
                obscureText: !_verPassword,
                decoration: InputDecoration(
                  labelText: 'Contraseña',
                  suffixIcon: IconButton(
                    icon: Icon(_verPassword
                        ? Icons.visibility_off
                        : Icons.visibility),
                    onPressed: () =>
                        setState(() => _verPassword = !_verPassword),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<Rol>(
                key: const Key('admin_usuario_rol'),
                value: _rol,
                decoration: const InputDecoration(labelText: 'Rol'),
                items: const [
                  DropdownMenuItem(
                    value: Rol.vendedor,
                    child: Text('Vendedor'),
                  ),
                  DropdownMenuItem(
                    value: Rol.cajero,
                    child: Text('Cajero'),
                  ),
                  DropdownMenuItem(
                    value: Rol.admin,
                    child: Text('Dueño / Admin'),
                  ),
                ],
                onChanged: (valor) => setState(() => _rol = valor ?? Rol.vendedor),
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  key: const Key('admin_usuario_error'),
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: estado.enviando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('admin_usuario_guardar'),
          onPressed: estado.enviando ? null : _crear,
          child: estado.enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Crear'),
        ),
      ],
    );
  }
}
