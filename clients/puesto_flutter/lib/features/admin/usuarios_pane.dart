import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exceptions.dart';
import '../../models/staff_session.dart';
import '../../models/usuario.dart';
import '../../services/usuarios_service.dart';
import 'usuario_form_dialog.dart';

/// Panel de gestión de usuarios: listado, alta y toggle activo/inactivo.
/// Solo accesible para rol admin.
class UsuariosPane extends ConsumerWidget {
  const UsuariosPane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usuarios = ref.watch(usuariosProvider);
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
              FilledButton.icon(
                key: const Key('admin_nuevo_usuario'),
                onPressed: () => mostrarFormUsuario(context),
                icon: const Icon(Icons.person_add_outlined),
                label: const Text('Nuevo usuario'),
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
            data: (lista) {
              if (lista.isEmpty) {
                return const Center(
                  child: Text(
                    'No hay usuarios.',
                    key: Key('usuarios_vacia'),
                  ),
                );
              }
              return ListView.separated(
                key: const Key('admin_usuarios_lista'),
                itemCount: lista.length + 1,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  if (index == lista.length) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        '${lista.length} usuario${lista.length == 1 ? '' : 's'}',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    );
                  }
                  return _UsuarioTile(usuario: lista[index]);
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _UsuarioTile extends ConsumerWidget {
  const _UsuarioTile({required this.usuario});

  final Usuario usuario;

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    final nuevoEstado = !usuario.activo;
    try {
      await ref
          .read(usuariosServiceProvider)
          .toggle(usuario.id, activo: nuevoEstado);
      ref.invalidate(usuariosProvider);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..removeCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('No se pudo cambiar el estado.')),
        );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          usuario.nombre.isNotEmpty
              ? usuario.nombre[0].toUpperCase()
              : '?',
          style: TextStyle(color: rolColors),
        ),
      ),
      title: Text(usuario.nombre),
      subtitle: Text('${usuario.email} · ${usuario.rol.label}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!usuario.activo)
            const Chip(
              label: Text('Inactivo'),
              visualDensity: VisualDensity.compact,
            ),
          Switch(
            key: Key('admin_usuario_toggle_${usuario.id}'),
            value: usuario.activo,
            onChanged: (_) => _toggle(context, ref),
          ),
        ],
      ),
    );
  }
}
