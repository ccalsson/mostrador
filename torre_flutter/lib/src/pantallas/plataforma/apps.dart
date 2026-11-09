import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class _Opcion {
  const _Opcion(this.id, this.label);
  final String id;
  final String label;
}

class _Selector {
  _Selector(this.label, this.opciones, String inicial)
      : valor = opciones.any((o) => o.id == inicial) ? inicial : (opciones.isEmpty ? '' : opciones.first.id);

  final String label;
  final List<_Opcion> opciones;
  String valor;

  Widget field() => Desplegable(
        label: label,
        valor: _etiquetaActual(),
        opciones: [for (final o in opciones) o.label],
        onChanged: (v) => valor = opciones.firstWhere((o) => o.label == v).id,
      );

  String _etiquetaActual() {
    for (final o in opciones) {
      if (o.id == valor) return o.label;
    }
    return opciones.isEmpty ? '' : opciones.first.label;
  }
}

const List<_Opcion> _estadosApp = [
  _Opcion('active', 'Activa'),
  _Opcion('paused', 'Pausada'),
  _Opcion('archived', 'Archivada'),
];

String _estadoApp(String status) {
  for (final o in _estadosApp) {
    if (o.id == status) return o.label;
  }
  return status.isEmpty ? '—' : status;
}

class PantallaApps extends StatefulWidget {
  const PantallaApps({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaApps> createState() => _PantallaAppsState();
}

class _PantallaAppsState extends State<PantallaApps> {
  int _version = 0;

  Future<List<dynamic>> _cargar() => widget.api.fnLista('listApps');

  @override
  Widget build(BuildContext context) {
    return VistaDatos<List<dynamic>>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _AppsVista(
        apps: datos,
        api: widget.api,
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _AppsVista extends StatefulWidget {
  const _AppsVista({required this.apps, required this.api, required this.onCambio});
  final List<dynamic> apps;
  final TorreApi api;
  final VoidCallback onCambio;

  @override
  State<_AppsVista> createState() => _AppsVistaState();
}

class _AppsVistaState extends State<_AppsVista> {
  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(alignment: Alignment.centerLeft, child: BotonPrimario('Nueva', () => _formulario(null))),
        const SizedBox(height: 14),
        if (widget.apps.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final a in widget.apps) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjeta(a)),
      ],
    );
  }

  Widget _tarjeta(dynamic app) {
    final c = torreColorsOf(context);
    final version = texto(app['currentVersion']);
    return Tarjeta(
      child: InkWell(
        onTap: () => _formulario(app),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(texto(app['name']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
                ),
                ChipEstado(_estadoApp(texto(app['status'])), activo: texto(app['status']) == 'active'),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '${texto(app['slug'])} · ${version.isEmpty ? 'sin versión' : version}',
                style: TextStyle(color: c.muted, fontSize: 13),
              ),
            ),
            if (texto(app['description']).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(texto(app['description']), style: TextStyle(color: c.inkSoft, fontSize: 13)),
              ),
            LineaDato('Repositorio', texto(app['repositoryUrl'])),
            LineaDato('Producción', texto(app['productionUrl'])),
          ],
        ),
      ),
    );
  }

  Future<void> _formulario(dynamic app) async {
    final c = torreColorsOf(context);
    final esEdicion = app != null;
    final nombre = TextEditingController(text: esEdicion ? texto(app['name']) : '');
    final slug = TextEditingController(text: esEdicion ? texto(app['slug']) : '');
    final descripcion = TextEditingController(text: esEdicion ? texto(app['description']) : '');
    final repositorio = TextEditingController(text: esEdicion ? texto(app['repositoryUrl']) : '');
    final produccion = TextEditingController(text: esEdicion ? texto(app['productionUrl']) : '');
    final version = TextEditingController(text: esEdicion ? texto(app['currentVersion']) : '');
    final estado = _Selector('Estado', _estadosApp, esEdicion ? texto(app['status']) : 'active');
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Ficha',
      campos: [
        Campo(controller: nombre, label: 'Nombre'),
        Campo(controller: slug, label: 'Slug'),
        Campo(controller: descripcion, label: 'Descripción', lineas: 2),
        Campo(controller: repositorio, label: 'Repositorio'),
        Campo(controller: produccion, label: 'Producción'),
        Campo(controller: version, label: 'Versión actual'),
        estado.field(),
        Text('Nombre y slug son obligatorios.', style: TextStyle(fontSize: 12, color: c.muted)),
      ],
      guardar: () => widget.api.fn('saveApp', <String, dynamic>{
        if (esEdicion) 'id': texto(app['id']),
        'name': nombre.text.trim(),
        'slug': slug.text.trim(),
        'description': descripcion.text.trim(),
        'status': estado.valor,
        'repositoryUrl': repositorio.text.trim(),
        'productionUrl': produccion.text.trim(),
        'currentVersion': version.text.trim(),
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Aplicación guardada');
    widget.onCambio();
  }
}
