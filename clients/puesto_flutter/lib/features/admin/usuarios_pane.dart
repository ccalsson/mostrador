import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../core/tema.dart';
import '../../core/widgets/tabla_web.dart';
import '../../models/staff_session.dart';
import '../../models/usuario.dart';
import '../../services/usuarios_service.dart';
import 'usuario_form_controller.dart';

/// A partir de este ancho la ficha queda al lado de la lista, como en la web.
const _quiebreFicha = 1024.0;

class UsuariosPane extends ConsumerStatefulWidget {
  const UsuariosPane({super.key});

  @override
  ConsumerState<UsuariosPane> createState() => _UsuariosPaneState();
}

class _UsuariosPaneState extends ConsumerState<UsuariosPane> {
  Usuario? _seleccionado;
  bool _modoNuevo = false;

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

  void _seleccionar(Usuario usuario, {required bool enRail}) {
    setState(() {
      _seleccionado = usuario;
      _modoNuevo = false;
      _validacion = null;
    });
    if (!enRail) _abrirFicha();
  }

  void _nuevo({required bool enRail}) {
    setState(() {
      _seleccionado = null;
      _modoNuevo = true;
      _limpiarForm();
    });
    if (!enRail) _abrirFicha();
  }

  void _cerrarFicha() {
    setState(() {
      _seleccionado = null;
      _modoNuevo = false;
      _validacion = null;
    });
  }

  Future<void> _abrirFicha() async {
    await showDialog<void>(
      context: context,
      builder: (dialogo) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 640),
          child: _TarjetaFicha(child: _ficha(dialogo, enRail: false)),
        ),
      ),
    );
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
    _limpiarForm();
    setState(() {
      _modoNuevo = false;
      _seleccionado = null;
    });
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
                        isDense: true,
                        border: OutlineInputBorder(),
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
                        isDense: true,
                        border: OutlineInputBorder(),
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

  Widget _ficha(BuildContext contexto, {required bool enRail}) {
    final estado = ref.watch(usuarioFormProvider);
    void cerrar() {
      if (!enRail) Navigator.of(contexto).pop();
      _cerrarFicha();
    }

    if (_modoNuevo) {
      return _FichaNuevo(
        nombreController: _nombre,
        emailController: _email,
        passwordController: _password,
        verPassword: _verPassword,
        rol: _rol,
        onVerPasswordChanged: (v) => setState(() => _verPassword = v),
        onRolChanged: (v) => setState(() => _rol = v),
        enviando: estado.enviando,
        errorMensaje: _validacion ?? estado.errorMensaje,
        onCrear: () async {
          await _crear();
          if (!enRail && contexto.mounted) {
            Navigator.of(contexto).pop();
          }
        },
        onCerrar: cerrar,
      );
    }
    final usuario = _seleccionado;
    if (usuario == null) {
      return _FichaVacia(onCerrar: () {
        if (!enRail && contexto.mounted) {
          Navigator.of(contexto).pop();
        }
      });
    }
    return _FichaUsuario(
      usuario: usuario,
      onToggle: () => _toggle(usuario),
      onCambiarClave: () => _cambiarClave(usuario),
      onCerrar: cerrar,
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final usuarios = ref.watch(usuariosProvider);

    return LayoutBuilder(
      builder: (context, constraints) {
        final enRail = constraints.maxWidth >= _quiebreFicha;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Activa o desactiva usuarios. Cambiá la contraseña desde la ficha.',
                    style: TextStyle(fontSize: 12.5, color: tokens.muted),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  key: const Key('admin_nuevo_usuario'),
                  onPressed: () => _nuevo(enRail: enRail),
                  icon: const Icon(Icons.person_add_outlined, size: 18),
                  label: const Text('Nuevo usuario'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: usuarios.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        error is ApiException
                            ? error.message
                            : 'No se pudieron cargar los usuarios.',
                        style: TextStyle(fontSize: 13, color: tokens.terra),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.tonal(
                        key: const Key('admin_usuarios_reintentar'),
                        onPressed: () => ref.invalidate(usuariosProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                ),
                data: (lista) {
                  final elegido = lista
                      .where((u) => u.id == _seleccionado?.id)
                      .firstOrNull;
                  final listado = _Listado(
                    usuarios: lista,
                    seleccion: _seleccionado?.id,
                    onTap: (u) => _seleccionar(u, enRail: enRail),
                    onToggle: _toggle,
                    onCambiarClave: _cambiarClave,
                  );

                  if (!enRail) return listado;

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: listado),
                      const SizedBox(width: 16),
                      SizedBox(
                        width: 340,
                        child: elegido == null && !_modoNuevo
                            ? Text(
                                'Elegí un usuario para ver su ficha.',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: tokens.muted,
                                ),
                              )
                            : _TarjetaFicha(child: _ficha(context, enRail: true)),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

class _Listado extends StatelessWidget {
  const _Listado({
    required this.usuarios,
    required this.seleccion,
    required this.onTap,
    required this.onToggle,
    required this.onCambiarClave,
  });

  final List<Usuario> usuarios;
  final String? seleccion;
  final ValueChanged<Usuario> onTap;
  final ValueChanged<Usuario> onToggle;
  final ValueChanged<Usuario> onCambiarClave;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    if (usuarios.isEmpty) {
      return Tarjeta(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
          child: Text(
            'No hay usuarios.',
            key: const Key('usuarios_vacia'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: tokens.muted),
          ),
        ),
      );
    }

    return Tarjeta(
      padding: EdgeInsets.zero,
      child: ListView.separated(
        key: const Key('admin_usuarios_lista'),
        padding: EdgeInsets.zero,
        itemCount: usuarios.length,
        separatorBuilder: (_, _) =>
            Divider(height: 1, thickness: 1, color: tokens.line),
        itemBuilder: (context, index) {
          final usuario = usuarios[index];
          return _FilaUsuario(
            key: Key('admin_usuario_${usuario.id}'),
            usuario: usuario,
            seleccionado: seleccion == usuario.id,
            onTap: () => onTap(usuario),
            onToggle: () => onToggle(usuario),
            onCambiarClave: () => onCambiarClave(usuario),
          );
        },
      ),
    );
  }
}

class _FilaUsuario extends StatefulWidget {
  const _FilaUsuario({
    super.key,
    required this.usuario,
    required this.seleccionado,
    required this.onTap,
    required this.onToggle,
    required this.onCambiarClave,
  });

  final Usuario usuario;
  final bool seleccionado;
  final VoidCallback onTap;
  final VoidCallback onToggle;
  final VoidCallback onCambiarClave;

  @override
  State<_FilaUsuario> createState() => _FilaUsuarioState();
}

class _FilaUsuarioState extends State<_FilaUsuario> {
  bool _encima = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final usuario = widget.usuario;

    final fondo = widget.seleccionado
        ? tokens.okBg
        : (_encima ? tokens.paper : null);

    return MouseRegion(
      onEnter: (_) => setState(() => _encima = true),
      onExit: (_) => setState(() => _encima = false),
      child: InkWell(
        onTap: widget.onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: fondo,
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      usuario.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: tokens.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${usuario.email} · ${usuario.rol.label}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: tokens.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Pildora(
                usuario.activo ? 'Activo' : 'Baja',
                color: usuario.activo ? tokens.ok : tokens.muted,
              ),
              const SizedBox(width: 6),
              IconButton(
                key: Key('admin_usuario_clave_${usuario.id}'),
                tooltip: 'Cambiar contraseña',
                icon: const Icon(Icons.key_outlined),
                iconSize: 16,
                color: tokens.inkSoft,
                visualDensity: VisualDensity.compact,
                style: IconButton.styleFrom(
                  minimumSize: const Size(30, 30),
                  padding: EdgeInsets.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: widget.onCambiarClave,
              ),
              const SizedBox(width: 4),
              Switch(
                key: Key('admin_usuario_toggle_${usuario.id}'),
                value: usuario.activo,
                onChanged: (_) => widget.onToggle(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tarjeta ficha (borde superior naranja)
// ---------------------------------------------------------------------------

class _TarjetaFicha extends StatelessWidget {
  const _TarjetaFicha({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Container(
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 2, color: tokens.naranja),
          Flexible(child: child),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Ficha: vacío, nuevo usuario, detalle de usuario
// ---------------------------------------------------------------------------

class _FichaVacia extends StatelessWidget {
  const _FichaVacia({required this.onCerrar});

  final VoidCallback onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Ficha',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: onCerrar,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.muted,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                child: const Text('Cerrar'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Elegí un usuario para ver su ficha.',
            style: TextStyle(fontSize: 12.5, color: tokens.muted),
          ),
        ],
      ),
    );
  }
}

class _FichaNuevo extends StatelessWidget {
  const _FichaNuevo({
    required this.nombreController,
    required this.emailController,
    required this.passwordController,
    required this.verPassword,
    required this.rol,
    required this.onVerPasswordChanged,
    required this.onRolChanged,
    required this.enviando,
    required this.errorMensaje,
    required this.onCrear,
    required this.onCerrar,
  });

  final TextEditingController nombreController;
  final TextEditingController emailController;
  final TextEditingController passwordController;
  final bool verPassword;
  final Rol rol;
  final ValueChanged<bool> onVerPasswordChanged;
  final ValueChanged<Rol> onRolChanged;
  final bool enviando;
  final String? errorMensaje;
  final FutureOr<void> Function() onCrear;
  final VoidCallback onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Nuevo usuario',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: enviando ? null : onCerrar,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.muted,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                child: const Text('Cerrar'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _campo(
            key: const Key('admin_usuario_nombre'),
            controller: nombreController,
            label: 'Nombre',
            requerido: true,
            capitalization: TextCapitalization.words,
          ),
          _campo(
            key: const Key('admin_usuario_email'),
            controller: emailController,
            label: 'Email',
            keyboardType: TextInputType.emailAddress,
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(
              key: const Key('admin_usuario_password'),
              controller: passwordController,
              obscureText: !verPassword,
              enabled: !enviando,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                labelText: 'Contraseña',
                isDense: true,
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(verPassword
                      ? Icons.visibility_off
                      : Icons.visibility),
                  onPressed: () => onVerPasswordChanged(!verPassword),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: DropdownButtonFormField<Rol>(
              key: const Key('admin_usuario_rol'),
              initialValue: rol,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Rol',
                isDense: true,
                border: OutlineInputBorder(),
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
              onChanged: enviando ? null : (valor) {
                if (valor != null) onRolChanged(valor);
              },
            ),
          ),
          if (errorMensaje != null) ...[
            const SizedBox(height: 6),
            Text(
              errorMensaje!,
              key: const Key('admin_usuario_error'),
              style: TextStyle(fontSize: 12.5, color: tokens.terra),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('admin_usuario_guardar'),
            onPressed: enviando ? null : () => onCrear(),
            style: ButtonStyle(
              minimumSize: WidgetStateProperty.all(const Size.fromHeight(38)),
            ),
            child: enviando
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Crear'),
          ),
        ],
      ),
    );
  }

  Widget _campo({
    required Key key,
    required TextEditingController controller,
    required String label,
    bool requerido = false,
    TextInputType? keyboardType,
    TextCapitalization capitalization = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: controller,
        keyboardType: keyboardType,
        textCapitalization: capitalization,
        enabled: !enviando,
        style: const TextStyle(fontSize: 13),
        decoration: InputDecoration(
          labelText: requerido ? '$label *' : label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}

class _FichaUsuario extends StatelessWidget {
  const _FichaUsuario({
    required this.usuario,
    required this.onToggle,
    required this.onCambiarClave,
    required this.onCerrar,
  });

  final Usuario usuario;
  final VoidCallback onToggle;
  final VoidCallback onCambiarClave;
  final VoidCallback onCerrar;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Ficha',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Fraunces',
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: onCerrar,
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  foregroundColor: tokens.muted,
                  textStyle: const TextStyle(fontSize: 12),
                ),
                child: const Text('Cerrar'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            usuario.nombre,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            usuario.email,
            style: TextStyle(fontSize: 12.5, color: tokens.muted),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Pildora(
                usuario.rol.label,
                color: tokens.inkSoft,
              ),
              const SizedBox(width: 6),
              Pildora(
                usuario.activo ? 'Activo' : 'Baja',
                color: usuario.activo ? tokens.ok : tokens.muted,
              ),
            ],
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onCambiarClave,
            icon: const Icon(Icons.key_outlined, size: 16),
            label: const Text('Cambiar contraseña'),
            style: ButtonStyle(
              minimumSize: WidgetStateProperty.all(const Size.fromHeight(38)),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: onToggle,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(38),
              side: BorderSide(color: tokens.line),
              foregroundColor: usuario.activo ? tokens.terra : tokens.ok,
              textStyle: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w500,
              ),
            ),
            child: Text(usuario.activo ? 'Desactivar' : 'Activar'),
          ),
        ],
      ),
    );
  }
}