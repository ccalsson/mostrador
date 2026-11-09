import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

const _apps = ['Mostrador', 'Mercado', 'Super al Toque', 'Materiales Ya', 'Torre'];
const _roles = ['', 'admin', 'cajero', 'vendedor', 'comprador', 'cargador', 'administracion', 'comercial', 'legal', 'soporte', 'auditoria'];
const _rolEtiquetas = ['Todos los roles', 'Admin', 'Cajero', 'Vendedor', 'Comprador', 'Cargador', 'Administración', 'Comercial', 'Legal', 'Soporte', 'Auditoría'];
const _estados = ['Todos', 'Activos', 'Inactivos'];
const _estadoValores = ['', 'si', 'no'];

class PantallaUsuarios extends StatefulWidget {
  const PantallaUsuarios({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaUsuarios> createState() => _PantallaUsuariosState();
}

class _PantallaUsuariosState extends State<PantallaUsuarios> {
  final _controlador = TextEditingController();
  String _busqueda = '';
  String _app = '';
  String _rol = '';
  String _estado = '';

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<List<dynamic>> _cargar() => widget.api.fnLista('usuariosCentralizados', <String, dynamic>{
        'filtros': <String, dynamic>{
          'busqueda': _busqueda.trim(),
          'app': _app,
          'rol': _rol,
          'activo': _estado.isEmpty ? null : _estado == 'si',
        },
      });

  void _buscar() => setState(() => _busqueda = _controlador.text);

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Cada persona del ecosistema con todas sus llaves: staff, compradores, cargadores y Torre.',
          style: TextStyle(fontSize: 13, color: c.muted),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _controlador,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _buscar(),
          decoration: InputDecoration(
            hintText: 'Buscar por nombre o email',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward, size: 20), onPressed: _buscar),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Todas las apps'),
              selected: _app.isEmpty,
              onSelected: (_) => setState(() => _app = ''),
            ),
            for (final a in _apps)
              ChoiceChip(
                label: Text(a),
                selected: _app == a,
                onSelected: (_) => setState(() => _app = a),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Desplegable(
                label: 'Rol',
                valor: _rolEtiquetas[_roles.indexOf(_rol)],
                opciones: _rolEtiquetas,
                onChanged: (v) => setState(() => _rol = _roles[_rolEtiquetas.indexOf(v)]),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Desplegable(
                label: 'Estado',
                valor: _estados[_estadoValores.indexOf(_estado)],
                opciones: _estados,
                onChanged: (v) => setState(() => _estado = _estadoValores[_estados.indexOf(v)]),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        VistaDatos<List<dynamic>>(
          key: ValueKey('usuarios-$_busqueda-$_app-$_rol-$_estado'),
          cargar: _cargar,
          builder: _lista,
        ),
      ],
    );
  }

  Widget _lista(BuildContext context, List<dynamic> filas) {
    final c = torreColorsOf(context);
    if (filas.isEmpty) {
      return Text('No hay usuarios que coincidan con los filtros.', style: TextStyle(fontSize: 13, color: c.muted));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${filas.length} usuarios', style: TextStyle(fontSize: 12, color: c.muted)),
        const SizedBox(height: 8),
        for (final u in filas.take(300))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Usuario(u),
          ),
      ],
    );
  }
}

class _Usuario extends StatelessWidget {
  const _Usuario(this.u);
  final dynamic u;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final apps = u['apps'] as List? ?? const [];
    final activo = u['activoGlobal'] == true;
    final telefono = texto(u['telefono']);
    final contacto = telefono.isEmpty ? texto(u['email']) : '${texto(u['email'])} · $telefono';
    return Tarjeta(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(texto(u['nombre']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(contacto, style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ChipEstado(activo ? 'Activo' : 'Inactivo', activo: activo),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final a in apps) ChipEstado('${texto(a['app'])} · ${texto(a['rol'])}', activo: a['activo'] == true),
              Text(
                _ultimoLogin(u['ultimoLogin']),
                style: TextStyle(color: c.muted, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _ultimoLogin(dynamic v) {
    final iso = texto(v);
    if (iso.isEmpty) return 'Sin ingreso registrado';
    return 'Último ingreso ${fmtFecha(iso)}';
  }
}
