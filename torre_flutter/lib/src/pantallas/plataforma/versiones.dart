import 'package:flutter/material.dart';

import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

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

class _CampoFecha extends StatelessWidget {
  const _CampoFecha({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      readOnly: true,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(labelText: label, helperText: 'AAA-MM-DD'),
      onTap: () async {
        final hoy = DateTime.now();
        final elegido = await showDatePicker(
          context: context,
          initialDate: DateTime.tryParse(controller.text) ?? hoy,
          firstDate: DateTime(hoy.year - 10),
          lastDate: DateTime(hoy.year + 10),
        );
        if (elegido != null) controller.text = _iso(elegido);
      },
    );
  }
}

class _Casillero extends StatefulWidget {
  const _Casillero({required this.label, required this.onCambio});
  final String label;
  final ValueChanged<bool> onCambio;

  @override
  State<_Casillero> createState() => _CasilleroState();
}

class _CasilleroState extends State<_Casillero> {
  bool _marca = false;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      controlAffinity: ListTileControlAffinity.leading,
      title: Text(widget.label, style: TextStyle(fontSize: 14, color: c.ink)),
      value: _marca,
      onChanged: (v) => setState(() {
        _marca = v ?? false;
        widget.onCambio(_marca);
      }),
    );
  }
}

const List<_Opcion> _plataformas = [
  _Opcion('web', 'Web'),
  _Opcion('android', 'Android'),
  _Opcion('windows', 'Windows'),
];

const List<_Opcion> _alcances = [
  _Opcion('all', 'Todos'),
  _Opcion('tenant', 'Un tenant'),
  _Opcion('branch', 'Una sucursal'),
  _Opcion('beta', 'Canal beta'),
];

String _etiquetaDe(List<_Opcion> opciones, String id) {
  for (final o in opciones) {
    if (o.id == id) return o.label;
  }
  return opciones.isEmpty ? '' : opciones.first.label;
}

/// Mesma compara de versión que la web (segmentos numéricos).
int _cmpVersion(String a, String b) {
  final pa = a.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final pb = b.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final largo = pa.length > pb.length ? pa.length : pb.length;
  for (var i = 0; i < largo; i++) {
    final d = (i < pa.length ? pa[i] : 0) - (i < pb.length ? pb[i] : 0);
    if (d != 0) return d;
  }
  return 0;
}

class _VersionesDatos {
  _VersionesDatos(this.apps, this.versions, this.tenants, this.targets, this.branches);
  final List<dynamic> apps;
  final List<dynamic> versions;
  final List<dynamic> tenants;
  final List<dynamic> targets;
  final List<dynamic> branches;
}

class PantallaVersiones extends StatefulWidget {
  const PantallaVersiones({super.key, required this.api});
  final TorreApi api;

  @override
  State<PantallaVersiones> createState() => _PantallaVersionesState();
}

class _PantallaVersionesState extends State<PantallaVersiones> {
  int _version = 0;
  String _appId = '';

  Future<_VersionesDatos> _cargar() async {
    final apps = await widget.api.fnLista('listApps');
    final versions = await widget.api.fnLista('listVersions');
    final tenants = await widget.api.fnLista('listTenants');
    final targets = await widget.api.fnLista('listTargets');
    final branches = await widget.api.fnLista('listBranches');
    return _VersionesDatos(apps, versions, tenants, targets, branches);
  }

  @override
  Widget build(BuildContext context) {
    return VistaDatos<_VersionesDatos>(
      key: ValueKey(_version),
      cargar: _cargar,
      builder: (context, datos) => _VersionesVista(
        datos: datos,
        api: widget.api,
        appId: _appId,
        onElegirApp: (id) => setState(() => _appId = id),
        onCambio: () => setState(() => _version++),
      ),
    );
  }
}

class _VersionesVista extends StatefulWidget {
  const _VersionesVista({
    required this.datos,
    required this.api,
    required this.appId,
    required this.onElegirApp,
    required this.onCambio,
  });
  final _VersionesDatos datos;
  final TorreApi api;
  final String appId;
  final ValueChanged<String> onElegirApp;
  final VoidCallback onCambio;

  @override
  State<_VersionesVista> createState() => _VersionesVistaState();
}

class _VersionesVistaState extends State<_VersionesVista> {
  List<dynamic> get _propias => widget.datos.versions.where((v) => texto(v['appId']) == _elegida).toList();

  List<dynamic> get _puestos => widget.datos.tenants
      .where((t) => texto(t['appId']) == _elegida && texto(t['status']) == 'active')
      .toList();

  String get _elegida {
    if (widget.appId.isNotEmpty && widget.datos.apps.any((a) => texto(a['id']) == widget.appId)) return widget.appId;
    return widget.datos.apps.isEmpty ? '' : texto(widget.datos.apps.first['id']);
  }

  dynamic get _app {
    for (final a in widget.datos.apps) {
      if (texto(a['id']) == _elegida) return a;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    final disponibles = texto(_app?['currentVersion']);
    final propias = _propias;
    final puestos = _puestos;
    final targets = widget.datos.targets;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Desplegable(
          label: 'Aplicación',
          valor: _app == null ? '' : texto(_app['name']),
          opciones: [for (final a in widget.datos.apps) texto(a['name'])],
          onChanged: (nombre) {
            for (final a in widget.datos.apps) {
              if (texto(a['name']) == nombre) widget.onElegirApp(texto(a['id']));
            }
          },
        ),
        const SizedBox(height: 10),
        Text(
          'Versión disponible: ${disponibles.isEmpty ? 'sin cargar' : disponibles}',
          style: TextStyle(fontSize: 14, color: c.ink),
        ),
        const SizedBox(height: 12),
        _Seccion('Puestos (${puestos.length})'),
        if (puestos.isEmpty)
          Text('Nada pendiente.', style: TextStyle(color: c.muted))
        else
          for (final t in puestos)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Tarjeta(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    Expanded(child: Text(texto(t['name']), style: TextStyle(color: c.ink, fontSize: 14))),
                    Text(_marcaPuesto(t, disponibles), style: TextStyle(color: c.inkSoft, fontSize: 13)),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(child: _Seccion('Historial (${propias.length})')),
            BotonPrimario('Nueva versión', _nueva),
          ],
        ),
        if (propias.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final v in propias) Padding(padding: const EdgeInsets.only(bottom: 8), child: _tarjetaVersion(v)),
        const SizedBox(height: 18),
        _Seccion('Quién puede actualizar (${targets.length})'),
        if (targets.isEmpty)
          Text('Sin resultados.', style: TextStyle(color: c.muted))
        else
          for (final t in targets)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Tarjeta(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${texto(t['appName'])} ${texto(t['version'])}',
                      style: TextStyle(color: c.ink, fontWeight: FontWeight.w600),
                    ),
                    Text(_detalleTarget(t), style: TextStyle(color: c.muted, fontSize: 12)),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  String _marcaPuesto(dynamic tenant, String disponible) {
    final instalada = texto(tenant['installedVersion']);
    final ok = disponible.isNotEmpty && _cmpVersion(instalada.isEmpty ? '0' : instalada, disponible) >= 0;
    return '${instalada.isEmpty ? '—' : instalada} ${ok ? '✓' : '⚠'}';
  }

  String _detalleTarget(dynamic t) {
    final alcance = [texto(t['scope']), texto(t['tenantName']), texto(t['branchName'])].where((s) => s.isNotEmpty).join(' ');
    return '${texto(t['platform'])} · $alcance · ${texto(t['status'])}';
  }

  Widget _tarjetaVersion(dynamic v) {
    final c = torreColorsOf(context);
    final publicada = texto(v['status']) == 'published';
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(texto(v['version']), style: TextStyle(color: c.ink, fontWeight: FontWeight.w600)),
              ),
              if (v['mandatory'] == true) Text('Obligatoria', style: TextStyle(fontSize: 12, color: c.terra)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${texto(v['platform'])} · ${texto(v['status'])} · ${texto(v['releaseDate'])}',
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
          ),
          LineaDato('Mínima soportada', texto(v['minimumSupportedVersion'])),
          LineaDato('SHA-256', texto(v['checksum'])),
          LineaDato('Descarga', texto(v['downloadUrl'])),
          if (texto(v['changelog']).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(texto(v['changelog']), style: TextStyle(color: c.muted, fontSize: 13)),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 4,
              children: [
                TextButton(onPressed: () => _publicar(v), child: const Text('Publicar en Torre')),
                if (publicada)
                  TextButton(
                    onPressed: () => _recomendar(v),
                    child: Text('Recomendar anterior', style: TextStyle(color: c.terra)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _nueva() async {
    final version = TextEditingController();
    final fecha = TextEditingController(text: _iso(DateTime.now()));
    final cambios = TextEditingController();
    final descarga = TextEditingController();
    final checksum = TextEditingController();
    final minima = TextEditingController();
    final plataforma = _Selector('Plataforma', _plataformas, 'web');
    var obligatoria = false;
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Nueva versión',
      campos: [
        Campo(controller: version, label: 'Versión'),
        plataforma.field(),
        _CampoFecha(controller: fecha, label: 'Fecha'),
        Campo(controller: cambios, label: 'Cambios', lineas: 3),
        Campo(controller: descarga, label: 'Descarga'),
        Campo(controller: checksum, label: 'SHA-256'),
        Campo(controller: minima, label: 'Versión mínima soportada'),
        _Casillero(label: 'Actualización obligatoria', onCambio: (v) => obligatoria = v),
        Text('Queda guardada como lista; publicarla es un paso aparte.', style: TextStyle(fontSize: 12, color: torreColorsOf(context).muted)),
      ],
      guardar: () => widget.api.fn('saveVersion', <String, dynamic>{
        'appId': _elegida,
        'version': version.text.trim(),
        'platform': plataforma.valor,
        'releaseDate': fecha.text.trim(),
        'changelog': cambios.text.trim(),
        'downloadUrl': descarga.text.trim(),
        'status': 'ready',
        'checksum': checksum.text.trim(),
        'minimumSupportedVersion': minima.text.trim(),
        'mandatory': obligatoria,
      }),
    );
    if (!guardado || !mounted) return;
    aviso(context, 'Versión registrada');
    widget.onCambio();
  }

  Future<void> _publicar(dynamic version) async {
    final c = torreColorsOf(context);
    final alcance = _Selector('Quién la recibe', _alcances, 'all');
    final alcanceVisto = ValueNotifier<String>('all');
    final tenants = _Selector(
      'Tenant',
      [
        const _Opcion('', 'Sin tenant'),
        for (final t in widget.datos.tenants) _Opcion(texto(t['id']), texto(t['name'])),
      ],
      '',
    );
    final sucursales = _Selector(
      'Sucursal',
      [
        const _Opcion('', 'Sin sucursal'),
        for (final b in widget.datos.branches) _Opcion(texto(b['id']), '${texto(b['tenantName'])} · ${texto(b['name'])}'),
      ],
      '',
    );
    var mensaje = '';
    final guardado = await mostrarFormulario(
      context,
      titulo: 'Publicar ${texto(version['version'])}',
      campos: [
        Text(
          'Si no hay hook de Vercel, queda publicado en Torre y el deployment no se marca como confirmado.',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        Desplegable(
          label: alcance.label,
          valor: _etiquetaDe(_alcances, alcance.valor),
          opciones: [for (final o in _alcances) o.label],
          onChanged: (etiqueta) {
            alcance.valor = _alcances.firstWhere((o) => o.label == etiqueta).id;
            alcanceVisto.value = alcance.valor;
          },
        ),
        ListenableBuilder(
          listenable: alcanceVisto,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (alcanceVisto.value != 'all') tenants.field(),
              if (alcanceVisto.value == 'branch') sucursales.field(),
            ],
          ),
        ),
      ],
      guardar: () async {
        final res = await widget.api.fnMapa('publicarRelease', <String, dynamic>{
          'versionId': texto(version['id']),
          'scope': alcance.valor,
          'tenantId': tenants.valor,
          'branchId': sucursales.valor,
        });
        mensaje = texto(res['message']);
      },
    );
    alcanceVisto.dispose();
    if (!guardado || !mounted) return;
    aviso(context, mensaje.isEmpty ? 'Versión publicada.' : mensaje);
    widget.onCambio();
  }

  Future<void> _recomendar(dynamic version) async {
    final ok = await confirmarTorre(
      context,
      'Recomendar anterior',
      'Esto solo cambia el manifest. No revierte un deploy que ya esté corriendo.',
    );
    if (!ok || !mounted) return;
    try {
      final res = await widget.api.fnMapa('recomendarAnterior', texto(version['id']));
      if (!mounted) return;
      aviso(context, texto(res['message']));
      widget.onCambio();
    } catch (e) {
      if (mounted) aviso(context, '$e');
    }
  }
}

class _Seccion extends StatelessWidget {
  const _Seccion(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    final c = torreColorsOf(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(texto, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink)),
    );
  }
}
