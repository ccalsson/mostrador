import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/staff_session.dart';
import '../../models/usuario.dart';
import '../../services/usuarios_service.dart';
import 'usuario_form_controller.dart';

class UsuariosPane extends ConsumerStatefulWidget {
  const UsuariosPane({super.key});

  @override
  ConsumerState<UsuariosPane> createState() => _UsuariosPaneState();
}

class _UsuariosPaneState extends ConsumerState<UsuariosPane> {
  final _nombre = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  Rol _rol = Rol.vendedor;
  bool _verPassword = false;
  String? _validacion;

  @override
  void dispose() {
    _nombre.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _limpiarForm() {
    _nombre.clear();
    _email.clear();
    _password.clear();
    _rol = Rol.vendedor;
    _verPassword = false;
    _validacion = null;
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
    if (!ok || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Usuario creado.')),
    );
    ref.invalidate(usuariosProvider);
    _limpiarForm();
  }

  Future<void> _toggle(Usuario usuario) async {
    final nuevoEstado = !usuario.activo;
    try {
      await ref.read(usuariosServiceProvider).toggle(usuario.id, activo: nuevoEstado);
      ref.invalidate(usuariosProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('No se pudo cambiar el estado.')),
        );
    }
  }

  Future<void> _cambiarClave(Usuario usuario) async {
    final nuevaController = TextEditingController();
    final confirmarController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Cambiar contraseña'),
              content: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Usuario: ${usuario.nombre}'),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('cambiar_clave_input'),
                      controller: nuevaController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Nueva contraseña',
                        hintText: 'Mínimo 8 caracteres',
                      ),
                      validator: (value) {
                        if (value == null || value.length < 8) {
                          return 'La contraseña debe tener al menos 8 caracteres';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      key: const Key('cambiar_clave_confirmar'),
                      controller: confirmarController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Confirmar contraseña',
                      ),
                      validator: (value) {
                        if (value != nuevaController.text) {
                          return 'Las contraseñas no coinciden';
                        }
                        return null;
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  key: const Key('cambiar_clave_guardar'),
                  onPressed: () {
                    if (formKey.currentState?.validate() ?? false) {
                      Navigator.of(context).pop(true);
                    }
                  },
                  child: const Text('Cambiar'),
                ),
              ],
            );
          },
        );
      },
    );
    final nuevaClave = nuevaController.text;
    // Dispose after the dialog's exit animation completes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      nuevaController.dispose();
      confirmarController.dispose();
    });
    if (result != true || !mounted) return;
    try {
      await ref.read(usuariosServiceProvider).cambiarClave(usuario.id, password: nuevaClave);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Contraseña actualizada')));
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('No se pudo cambiar la contraseña.')),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final usuarios = ref.watch(usuariosProvider);
    final estado = ref.watch(usuarioFormProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Usuarios',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: usuarios.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error is ApiException
                      ? error.message
                      : 'No se pudieron cargar los usuarios.'),
                  const SizedBox(height: 16),
                  FilledButton.tonal(
                    key: const Key('admin_usuarios_reintentar'),
                    onPressed: () => ref.invalidate(usuariosProvider),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
            data: (lista) => Row(
              children: [
                Expanded(
                  flex: 2,
                  child: lista.isEmpty
                      ? const Center(
                          child: Text(
                            'No hay usuarios.',
                            key: Key('usuarios_vacia'),
                          ),
                        )
                      : ListView.separated(
                          key: const Key('admin_usuarios_lista'),
                          itemCount: lista.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            return _UsuarioTile(
                              usuario: lista[index],
                              onToggle: () => _toggle(lista[index]),
                              onCambiarClave: () => _cambiarClave(lista[index]),
                            );
                          },
                        ),
                ),
                Expanded(
                  flex: 3,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerLowest,
                      border: Border(
                        left: BorderSide(color: Theme.of(context).dividerColor),
                      ),
                    ),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Nuevo usuario',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            key: const Key('admin_usuario_nombre'),
                            controller: _nombre,
                            textCapitalization: TextCapitalization.words,
                            enabled: !estado.enviando,
                            decoration: const InputDecoration(
                              labelText: 'Nombre',
                              isDense: true,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            key: const Key('admin_usuario_email'),
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            enabled: !estado.enviando,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                              isDense: true,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            key: const Key('admin_usuario_password'),
                            controller: _password,
                            obscureText: !_verPassword,
                            enabled: !estado.enviando,
                            decoration: InputDecoration(
                              labelText: 'Contraseña',
                              isDense: true,
                              suffixIcon: IconButton(
                                icon: Icon(_verPassword
                                    ? Icons.visibility_off
                                    : Icons.visibility),
                                onPressed: () =>
                                    setState(() => _verPassword = !_verPassword),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<Rol>(
                            key: const Key('admin_usuario_rol'),
                            initialValue: _rol,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Rol',
                              isDense: true,
                            ),
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
                            onChanged: estado.enviando
                                ? null
                                : (valor) =>
                                    setState(() => _rol = valor ?? Rol.vendedor),
                          ),
                          if (_validacion != null || estado.errorMensaje != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              _validacion ?? estado.errorMensaje!,
                              key: const Key('admin_usuario_error'),
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
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
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Text(
                              '${lista.length} usuario${lista.length == 1 ? '' : 's'}',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _UsuarioTile extends StatelessWidget {
  const _UsuarioTile({
    required this.usuario,
    required this.onToggle,
    required this.onCambiarClave,
  });

  final Usuario usuario;
  final VoidCallback onToggle;
  final VoidCallback onCambiarClave;

  @override
  Widget build(BuildContext context) {
    final rolColors = switch (usuario.rol) {
      Rol.admin => Colors.deepPurple,
      Rol.cajero => Colors.blue,
      Rol.vendedor => Colors.teal,
    };
    return ListTile(
      key: Key('admin_usuario_${usuario.id}'),
      leading: CircleAvatar(
        backgroundColor: rolColors.withValues(alpha: 0.12),
        child: Text(
          usuario.nombre.isNotEmpty ? usuario.nombre[0].toUpperCase() : '?',
          style: TextStyle(color: rolColors),
        ),
      ),
      title: Text(usuario.nombre),
      subtitle: Text('${usuario.email} · ${usuario.rol.label}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!usuario.activo)
            Chip(
              label: const Text('Baja'),
              visualDensity: VisualDensity.compact,
              backgroundColor: Theme.of(context).colorScheme.errorContainer,
            ),
          IconButton(
            key: Key('admin_usuario_clave_${usuario.id}'),
            tooltip: 'Cambiar contraseña',
            icon: const Icon(Icons.key_outlined),
            onPressed: onCambiarClave,
          ),
          Switch(
            key: Key('admin_usuario_toggle_${usuario.id}'),
            value: usuario.activo,
            onChanged: (_) => onToggle(),
          ),
        ],
      ),
    );
  }
}
